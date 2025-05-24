function setCookie(name, value, minutes) {
  var expires = "";
  if (minutes) {
    var date = new Date();
    date.setTime(date.getTime() + minutes * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function eraseCookie(name) {
  document.cookie = name + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
}

export var websocket;

export var events = {
  /***** EVENTS WITH DEFAULT BEHAVIOR *****/

  /** set a cookie */
  setCookieEvent: (event) => {
    setCookie(event.name, event.value, event.minutes);
  },
  /** redirect to a different page */
  redirectEvent: (event) => {
    window.location.replace(event.url);
  },

  /*****  EVENTS WITHOUT DEFAULT BEHAVIOR *****/

  /** a new client connects to the server */
  connectionEvent: (event) => {},
  /** a player presses their buzzer or the buzzers are cleared */
  buzzEvent: (event) => {},
  /** a player's score has changed */
  scoreEvent: (event) => {},
  /** the list of players changes */
  playersEvent: (event) => {},
  /** a bet is requested from the player */
  requestBetEvent: (event) => {},
  /** a bet is submitted by a player */
  submitBetEvent: (event) => {},
  /** an answer is requested from the player */
  requestAnswerEvent: (event) => {},
  /** an answer is submitted by a player */
  submitAnswerEvent: (event) => {},
};

var connectToWS = () => {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4) {
      let ws_addr = xhr.response;
      console.log(ws_addr);
      // connect to ws server
      websocket = new WebSocket(ws_addr);

      // send token
      websocket.onopen = (event) => {
        let token = getCookie("token");
        if (token === null) {
          token = "token not set";
        }
        websocket.send(JSON.stringify({ token: token }));
      };

      // reconnect to websocket if the connection is closed
      websocket.onclose = (event) => {
        setTimeout(connectToWS, 1000);
      };

      // handle server events
      websocket.onmessage = ({ data }) => {
        const event = JSON.parse(data);
        switch (event.type) {
          case "setCookie":
            events.setCookieEvent(event);
            break;
          case "redirect":
            events.redirectEvent(event);
            break;
          case "connection":
            events.connectionEvent(event);
            break;
          case "buzz":
            events.buzzEvent(event);
            break;
          case "score":
            events.scoreEvent(event);
            break;
          case "player":
            events.playersEvent(event);
            break;
          case "requestBet":
            events.requestBetEvent(event);
            break;
          case "submitBet":
            events.submitBetEvent(event);
            break;
          case "requestAnswer":
            events.requestAnswerEvent(event);
            break;
          case "submitAnswer":
            events.submitAnswerEvent(event);
            break;
          default:
            console.error("unsupported event", event);
        }
      };
    }
  };
  xhr.open("GET", "ws", true);
  xhr.send();
};

// reload the page if it changes visiblity
document.addEventListener("visibilitychange", (event) => {
  window.location.reload();
});

connectToWS();
