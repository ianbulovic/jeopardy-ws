import asyncio
import json
import logging
import subprocess
import websockets
from uuid import UUID
import time
from aiohttp import web
import qrcode


WEB_PORT = 8000
WS_PORT = 8001

##### LOGGING #####

logging.basicConfig(level=logging.INFO)

##### GAME STATE GLOBALS #####

# client websocket connections
CONNECTIONS = set()
# map session tokens to client ids
SESSION_TOKENS = {}
# map client ids to usernames
NAMES = {}
# chronologically-ordered list of client UUIDs that pressed their buzzer
BUZZ_LIST = []
# map client ids to scores
SCORES = {}
# set of client ids for current players
PLAYERS = set()
# a single client id for the host
HOST = None

##### QR CODE GENERATION #####

def generate_qr_code(data, outfile):
    qr = qrcode.QRCode()
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=(106, 100, 234), back_color=(10, 1, 61))
    img.save(outfile)

##### CONNECTION HELPER FUNCTIONS #####

def get_client_by_id(client_id):
    for client in CONNECTIONS:
        if client.id.hex == client_id:
            return client
    return None

def is_connected(client_id):
    return get_client_by_id(client_id) is not None

def get_client_id_by_name(client_name):
    for id in NAMES.keys():
        if NAMES[id] == client_name:
            return id
    return None

##### STATE UPDATE EVENTS #####

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is a uuid, return the hex value
            return obj.hex
        return json.JSONEncoder.default(self, obj)

# assemble a json string representing some event
def event(event_type, data):
    return json.dumps({"type": event_type, "value": data}, cls=UUIDEncoder)

# redirect to a different page
def redirect_event(url):
    return json.dumps({"type": "redirect", "url": url})

# set a client-side cookie
def set_cookie_event(name, value, minutes):
    return json.dumps({"type": "setCookie", "name": name, "value": value, "minutes": minutes})

# send dict mapping current connections to their name
# TODO probably unused
def connection_event():
    active_client_ids = [client.id.hex for client in CONNECTIONS]
    return event("connection", { id: NAMES[id] for id in active_client_ids} )

# buzz list state
def buzz_event():
    buzz_name_list = [NAMES[id] for id in BUZZ_LIST]
    return event("buzz", buzz_name_list)

# scores dict state
def score_event(player_id):
    return json.dumps({"type": "score", "player": NAMES[player_id], "value": SCORES[player_id]})

# player list state
def players_event():
    score_map = {NAMES[id]: SCORES[id] for id in PLAYERS}
    return event("player", score_map)

# request a bet from a player
def request_bet_event(player_score):
    return json.dumps({"type": "requestBet", "score": player_score})

# send a player's bet (to the host)
def submit_bet_event(player_id, bet_value):
    return json.dumps({"type": "submitBet", "player": NAMES[player_id], "value": bet_value})

# request an answer to a question from a player
def request_answer_event():
    return json.dumps({"type": "requestAnswer"})

# send a player's answer (to the host)
def submit_answer_event(player_id, answer_value):
    return json.dumps({"type": "submitAnswer", "player": NAMES[player_id], "value": answer_value})

##### SENDING EVENTS TO CLIENTS #####

# send an event to a specific client
async def send_event(client, event_func):
    try:
        await client.send(event_func())
    except:
        logging.error("could not send event to client")

# send an event to ALL clients
def broadcast_event(event_func):
    websockets.broadcast(CONNECTIONS, event_func())


##### CONNECTION HANDLERS #####

# handle a new client connection
async def handle_new_connection(client):

    # register client connection
    CONNECTIONS.add(client)

    # recieve session token from client
    message = json.loads(await client.recv())
    token = message["token"]

    if token in SESSION_TOKENS.keys():
        reassociate_old_client(client.id.hex, SESSION_TOKENS[token])
        SESSION_TOKENS[token] = client.id.hex
        if client.id.hex == HOST:
            await send_event(client, players_event)
        else:
            await send_event(client, lambda: score_event(client.id.hex))
    else:
        # assign client a session token
        token = client.id.hex + str(time.time())
        await send_event(client, lambda: set_cookie_event("token", token, 240))  # four hours
        SESSION_TOKENS[token] = client.id.hex

        # give new client a name
        new_name = "Unnamed player"
        requested_name = new_name
        i = 2
        while new_name in list(NAMES.values()):
            logging.debug(f"the name \"{new_name}\" is taken; using \"{requested_name} {i}\" instead")
            new_name = f"{requested_name} {i}"
            i += 1
        NAMES[client.id.hex] = new_name

        logging.debug(f"new connection: {new_name} joined from remote address {client.remote_address}")

        # score starts at zero
        SCORES[client.id.hex] = 0

        # broadcast connection event to all clients (including this one!)
        broadcast_event(connection_event)
        await redirect_client(client, "join")


# handle a client disconnection
def handle_disconnection(client):
    if client.id.hex in NAMES.keys():
        logging.debug(f"disconnection: {NAMES[client.id.hex]} disconnected from ws")
    elif client.id.hex == HOST:
        logging.debug(f"disconnection: the host disconnected from ws")
    CONNECTIONS.remove(client)
    if client.id.hex in BUZZ_LIST:
        BUZZ_LIST.remove(client.id.hex)
        broadcast_event(buzz_event)
    broadcast_event(connection_event)

# redirect a client to a different url
async def redirect_client(client, url):
    logging.info(f"redirect: sending {NAMES[client.id.hex]} to /{url}")
    await send_event(client, lambda: redirect_event(url))

# reassociate a new client with an old client's data
# used when a user disconnects from the game and wants to rejoin
# also used for redirection
def reassociate_old_client(new_id, old_id):
    global HOST
    if old_id in NAMES.keys():
        if old_id in [client.id.hex for client in CONNECTIONS]:
            logging.error(f"could not reassociate the user \"{NAMES[old_id]}\" because they are still connected")
        else:
            logging.debug(f"reassociated \"{NAMES[old_id]}\": id changed from {old_id} to {new_id}")

            NAMES[new_id] = NAMES[old_id]
            del NAMES[old_id]

            SCORES[new_id] = SCORES[old_id]
            del SCORES[old_id]

            if old_id in PLAYERS:
                PLAYERS.remove(old_id)
                PLAYERS.add(new_id)
            
            if HOST == old_id:
                HOST = new_id
    else:
        logging.error(f"could not find previous user with the id \"{old_id}\"")


##### CLIENT ACTION HANDLERS #####
# TODO some events don't need to be broadcast to everyone

async def handle_join_event(client, name):
    handle_name_change(client, name)
    logging.info(f"new player: {NAMES[client.id.hex]} joined the game")
    PLAYERS.add(client.id.hex)
    broadcast_event(players_event)
    await redirect_client(client, "buzzer")

async def handle_host_event(client):
    global HOST 
    if HOST is not None and is_connected(HOST):
        logging.error("host request denied: this game already has a host!")
        return
    HOST = client.id.hex
    logging.info("Host has joined the game")
    await redirect_client(client, "host")

async def handle_client_buzz(client):
    if client.id.hex not in BUZZ_LIST:
        logging.info(f"buzz: {NAMES[client.id.hex]} buzzed")
        BUZZ_LIST.append(client.id.hex)
        # notify the host and the relevant player
        await asyncio.gather(
            send_event(get_client_by_id(HOST), buzz_event),
            send_event(client, buzz_event),
        )

def handle_clear_buzzers(client):
    if not client.id.hex == HOST:
        logging.error("clear buzzers request denied: only the host can clear the buzzers")
        return
    logging.info(f"buzzers cleared by host")
    BUZZ_LIST.clear()
    broadcast_event(buzz_event)

async def handle_score_update(client, target_client_name, delta):
    if not client.id.hex == HOST:
        logging.error("score change request denied: only the host can modify scores")
        return
    target_client_id = get_client_id_by_name(target_client_name)
    SCORES[target_client_id] += delta
    logging.info(f"score update: changed the score of {NAMES[target_client_id]} to {SCORES[target_client_id]} (changed by {delta})")
    # notify the host and the relevant player
    await asyncio.gather(
        send_event(get_client_by_id(HOST), lambda: score_event(target_client_id)),
        send_event(get_client_by_id(target_client_id), lambda: score_event(target_client_id)),
    )

async def handle_kick_player(client, target_client_name):
    target_client_id = get_client_id_by_name(target_client_name)
    target_client = get_client_by_id(target_client_id)
    logging.info(f"kicking {NAMES[target_client_id]} from the game")

    if is_connected(target_client_id):
        logging.info(f"sending {NAMES[target_client_id]} back to /join page")
        await send_event(target_client, lambda: set_cookie_event("token", "token not set", 1))
        await send_event(target_client, lambda: redirect_event("join"))

    PLAYERS.remove(target_client_id)
    del NAMES[target_client_id]
    del SCORES[target_client_id]

    broadcast_event(players_event)

def handle_name_change(client, new_name):
    new_name = new_name.strip().lower()
    # TODO add regex validation (probably do this from html form)
    if client.id.hex in NAMES.keys() and NAMES[client.id.hex] == new_name: # this is already your name!
        return
    requested_name = new_name
    i = 2
    while new_name in list(NAMES.values()):
        logging.debug(f"the name \"{new_name}\" is taken; using \"{requested_name} {i}\" instead")
        new_name = f"{requested_name} {i}"
        i += 1
    logging.info(f"name change: {NAMES[client.id.hex]} changed their name to {new_name}")
    NAMES[client.id.hex] = new_name
    broadcast_event(connection_event)

async def handle_request_bet(client, target_client_name):
    target_client_id = get_client_id_by_name(target_client_name)
    if target_client_id not in PLAYERS:
        logging.error("cannot request a bet from a client that is not a player")
        return
    else:
        logging.info(f"bet requested from {target_client_name}")
        await send_event(get_client_by_id(target_client_id), lambda: request_bet_event(SCORES[target_client_id]))

async def handle_request_all_bets(client):
    def req_func(id):
        return lambda: request_bet_event(SCORES[id])
    
    await asyncio.gather(*[send_event(get_client_by_id(target_client_id), req_func(target_client_id)) for target_client_id in PLAYERS])

async def handle_submit_bet(client, bet):
    logging.info(f"bet submitted: {NAMES[client.id.hex]} bet {bet}")
    await send_event(get_client_by_id(HOST), lambda: submit_bet_event(client.id.hex, bet))

async def handle_request_all_answers(client):
    await asyncio.gather(*[send_event(get_client_by_id(target_client_id), request_answer_event) for target_client_id in PLAYERS])

async def handle_submit_answer(client, answer):
    logging.info(f"answer submitted: {NAMES[client.id.hex]} answered \"{answer}\"")
    await send_event(get_client_by_id(HOST), lambda: submit_answer_event(client.id.hex, answer))

##### MANAGE WEBSOCKET CONNECTIONS #####

async def jeopardy(client):
    try:
        # client connects
        await handle_new_connection(client)

        # handle client-side events
        async for message in client:
            event = json.loads(message)
            action = event["action"]
            if action == "join":
                await handle_join_event(client, event["name"])
            elif action == "host":
                await handle_host_event(client)
            elif action == "buzz":
                await handle_client_buzz(client)
            elif action == "clearBuzzers":
                handle_clear_buzzers(client)
            elif action == "changeScore":
                await handle_score_update(client, event["target"], event["delta"])
            elif action == "kickPlayer":
                await handle_kick_player(client, event["target"])
            elif action == "requestBet":
                await handle_request_bet(client, event["target"])
            elif action == "requestAllBets":
                await handle_request_all_bets(client)
            elif action == "submitBet":
                await handle_submit_bet(client, event["bet"])
            elif action == "requestAllAnswers":
                await handle_request_all_answers(client)
            elif action == "submitAnswer":
                await handle_submit_answer(client, event["answer"])
            else:
                logging.error(f"unsupported event: {event} from client id {client.id.hex}")
    except:
        if client.id.hex in NAMES.keys():
            logging.error(f"connection error: {NAMES[client.id.hex]} disconnected unexpectedly")
        elif client.id.hex == HOST:
            logging.error(f"connection error: the host disconnected unexpectedly")
        else:
            logging.error(f"connection error: an unknown client disconnected unexpectedly")
            
    finally:
        # client disconnects
        handle_disconnection(client)


##### HTTP ROUTING #####

routes = web.RouteTableDef()

@routes.get('/')
async def index_page(request):
    raise web.HTTPFound('/join')

@routes.get('/ws')
async def ws_addr(request):
    return web.Response(text=f"ws://{my_ip}:{WS_PORT}")

@routes.get('/join')
async def join_page(request):
    return web.FileResponse("join.html")

@routes.get('/buzzer')
async def buzzer_page(request):
    return web.FileResponse("buzzer.html")

@routes.get('/host')
async def host_page(request):
    return web.FileResponse("host.html")

@routes.get('/final')
async def final_page(request):
    return web.FileResponse("final.html")


##### START SERVER #####

def create_web_app():
    app = web.Application()
    app.add_routes(routes)
    app.add_routes([
        web.static('/css/', './css/'),
        web.static('/fonts/', './fonts/'),
        web.static('/scripts/', './scripts/'),
        web.static('/images/', './images/'),
    ])
    return web.AppRunner(app, access_log=None)

async def main():
    web_app = create_web_app()
    await web_app.setup()
    site = web.TCPSite(web_app, my_ip, WEB_PORT)
    await site.start()
    async with websockets.serve(jeopardy, my_ip, WS_PORT):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    my_ip = subprocess.run(["ipconfig", "getifaddr", "en0"], stdout=subprocess.PIPE).stdout.decode("utf-8").strip()
    web_address = f"http://{my_ip}:{WEB_PORT}"
    generate_qr_code(web_address, "images/qr.png")
    print(f"=====================================\nConnect at {web_address}\n=====================================")
    asyncio.run(main())