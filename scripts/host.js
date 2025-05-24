import { websocket, events } from "./ws.js";

window.addEventListener("DOMContentLoaded", () => {
  // relevant DOM elements
  var qrCode = document.querySelector(".qr-code");
  var playerControls = document.querySelector(".player-controls-flexbox");

  var playerNameHeading = document.querySelector(".selected-player-name");
  var playerScoreHeading = document.querySelector(".selected-player-score");

  var clearBuzzersButton = document.querySelector(".clear-button");
  var buzzListElement = document.querySelector(".scrollable-buzz-list");
  var buzzListItemTemplate = document.querySelector(".buzz-list-item-template");

  var addButton = document.querySelector(".add-button");
  var subtractButton = document.querySelector(".subtract-button");
  var doubleButton = document.querySelector(".double-button");

  var requestBetButton = document.querySelector(".request-bet-button");
  var kickButton = document.querySelector(".kick-button");

  var playersArea = document.querySelector(".players-area");
  var playerCardTemplate = document.querySelector(".player-card-template");

  var finalJeopardyButton = document.querySelector(".final-jeopardy-button");

  var scoreButtons = [
    document.querySelector(".score-button-1"),
    document.querySelector(".score-button-2"),
    document.querySelector(".score-button-3"),
    document.querySelector(".score-button-4"),
    document.querySelector(".score-button-5"),
  ];
  var customScoreButton = document.querySelector(".score-button-custom");

  var playerScores = {};
  var buzzList = [];

  var selectedPlayer = null;
  var doubleJeopardy = false;
  var positiveScoreButtons = true;
  var customScoreButtonValue = 0;

  var updateControlsArea = (name) => {
    if (name && !(selectedPlayer === name)) {
      qrCode.style.display = "none";
      playerControls.style.display = "flex";
      selectedPlayer = name;
      playerNameHeading.textContent = selectedPlayer;
      playerScoreHeading.textContent = playerScores[selectedPlayer];
    } else {
      playerControls.style.display = "none";
      qrCode.style.display = "grid";
      selectedPlayer = null;
    }
  };

  // DOM update functions and button events
  var updateBuzzList = () => {
    buzzListElement.innerHTML = "";
    for (let name of buzzList) {
      let clone = buzzListItemTemplate.content.cloneNode(true);
      let buttonElement = clone.querySelector(".player-card");
      buttonElement.querySelector(".player-name").innerHTML = name;
      buzzListElement.appendChild(clone);

      buttonElement.onclick = (event) => {
        updateControlsArea(name);
      };
    }
  };

  var updatePlayers = () => {
    playersArea.innerHTML = "";
    for (let name in playerScores) {
      let score = playerScores[name];
      let clone = playerCardTemplate.content.cloneNode(true);
      let buttonElement = clone.querySelector(".player-card");
      let nameElement = clone.querySelector(".player-name");
      let scoreElement = clone.querySelector(".player-points-value");
      nameElement.innerHTML = name;
      scoreElement.innerHTML = score;
      playersArea.appendChild(clone);

      buttonElement.onclick = (event) => {
        updateControlsArea(name);
      };
    }
  };

  var updateScoreButtons = () => {
    for (let i = 0; i < scoreButtons.length; i++) {
      // calculate the value for each score button, and update its click event
      const delta =
        (positiveScoreButtons ? 1 : -1) *
        (i + 1) *
        (doubleJeopardy ? 400 : 200);
      scoreButtons[i].textContent = `${delta}`;
      scoreButtons[i].onclick = (event) => {
        websocket.send(
          JSON.stringify({
            action: "changeScore",
            target: selectedPlayer,
            delta: delta,
          })
        );
      };
    }
    // same thing for custom value
    const customDelta =
      (positiveScoreButtons ? 1 : -1) * customScoreButtonValue;
    customScoreButton.textContent = `${customDelta}`;
    customScoreButton.onclick = (event) => {
      websocket.send(
        JSON.stringify({
          action: "changeScore",
          target: selectedPlayer,
          delta: customDelta,
        })
      );
    };
  };
  updateScoreButtons();

  clearBuzzersButton.onclick = (event) => {
    websocket.send(JSON.stringify({ action: "clearBuzzers" }));
  };

  finalJeopardyButton.onclick = (event) => {
    window.location.replace("/final");
  };

  addButton.onclick = (event) => {
    if (!positiveScoreButtons) {
      positiveScoreButtons = true;
      updateScoreButtons();
    }
  };

  subtractButton.onclick = (event) => {
    if (positiveScoreButtons) {
      positiveScoreButtons = false;
      updateScoreButtons();
    }
  };

  doubleButton.onclick = (event) => {
    doubleJeopardy = !doubleJeopardy;
    updateScoreButtons();
  };

  requestBetButton.onclick = (event) => {
    websocket.send(
      JSON.stringify({ action: "requestBet", target: selectedPlayer })
    );
  };

  kickButton.onclick = (event) => {
    websocket.send(
      JSON.stringify({ action: "kickPlayer", target: selectedPlayer })
    );
    updateControlsArea(null);
  };

  // server events
  events.playersEvent = (event) => {
    playerScores = event.value;
    updatePlayers();
  };

  events.scoreEvent = (event) => {
    playerScores[event.player] = event.value;
    if (selectedPlayer) {
      playerScoreHeading.textContent = playerScores[selectedPlayer];
    }
    updatePlayers();
  };

  events.buzzEvent = (event) => {
    buzzList = event.value;
    updateBuzzList();
  };

  events.submitBetEvent = (event) => {
    customScoreButtonValue = event.value;
    updateScoreButtons();
  };
});
