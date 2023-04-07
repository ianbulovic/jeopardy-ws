import {websocket, events} from './ws.js'

window.addEventListener("DOMContentLoaded", () => {
    
    // relevant DOM elements
    var requestBetButton    = document.querySelector(".request-bet-button");
    var requestAnswerButton = document.querySelector(".request-answer-button");

    var playersTable      = document.querySelector(".players-table");
    var playerRowTemplate = document.querySelector(".player-row-template");

    // map player names to table rows
    var playerRowMap = {};

    var generateTableRows = (playerScoreMap) => {
        // clear playerRowMap
        playerRowMap = {};

        for (let playerName in playerScoreMap) {
            const row = playerRowTemplate.content.cloneNode(true);
            
            const nameField  = row.querySelector(".player-name");
            const scoreField = row.querySelector(".player-score");
            const betField = row.querySelector(".player-bet");
            
            nameField.textContent = playerName;
            scoreField.textContent = playerScoreMap[playerName];
            
            const correctButton = row.querySelector(".correct-button");
            const incorrectButton = row.querySelector(".incorrect-button");
            
            correctButton.onclick = (event) => {
                const bet = Number(betField.textContent);
                websocket.send(JSON.stringify({action: "changeScore", target: playerName, delta: bet}));
            };
            
            incorrectButton.onclick = (event) => {
                let bet = Number(betField.textContent);
                websocket.send(JSON.stringify({action: "changeScore", target: playerName, delta: -bet}));
            };
            
            playersTable.appendChild(row);

            playerRowMap[playerName] = playersTable.lastElementChild;
        }

    };

    requestBetButton.onclick = (event) => {
        websocket.send(JSON.stringify({action: "requestAllBets"}));
    };

    requestAnswerButton.onclick = (event) => {
        websocket.send(JSON.stringify({action: "requestAllAnswers"}));
    };

    // server events

    // triggered on connection to ws
    events.playersEvent = (event) => {
        generateTableRows(event.value);
    };

    events.submitBetEvent = (event) => {
        let playerName = event.player;
        let betValue = event.value;
        playerRowMap[playerName].querySelector(".player-bet").textContent = betValue;
    };

    events.submitAnswerEvent = (event) => {
        let playerName = event.player;
        let answerValue = event.value;
        playerRowMap[playerName].querySelector(".player-answer").textContent = answerValue;    
    };

    events.scoreEvent = (event) => {
        let playerName = event.player;
        let newScore = event.value;
        playerRowMap[playerName].querySelector(".player-score").textContent = newScore;
    };

});