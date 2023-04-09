import {websocket, events} from './ws.js'

window.addEventListener("DOMContentLoaded", () => {
    // get relevant DOM elements
    var scoreDisplay = document.querySelector(".score-display");
    var buzzer       = document.querySelector(".buzzer");

    var shade = document.querySelector(".shade");
    
    var betModal = document.querySelector(".bet-modal");
    var betInput = document.querySelector(".bet-input");
    var betForm  = document.querySelector(".bet-form");
    
    var answerModal = document.querySelector(".answer-modal");
    var answerInput = document.querySelector(".answer-input");
    var answerForm  = document.querySelector(".answer-form");

    events.scoreEvent = (event) => {
        scoreDisplay.textContent = event.value;
    };

    // buzzing
    var buzzerLocked = false;

    var lockBuzzer = () => {
        buzzerLocked = true;
        buzzer.style["transform"] = "translateY(10px)";
        buzzer.style["box-shadow"] = "0 5px var(--bg1)";
        buzzer.style["background"] = "rgb(34,29,132)";
        buzzer.style["color"] = "rgb(181, 186, 196)";
    };

    var unlockBuzzer = () => {
        buzzerLocked = false;
        buzzer.style["transform"] = "translateY(0px)";
        buzzer.style["box-shadow"] = "0 15px var(--bg1)";
        buzzer.style["background"] = "var(--bg2)";
        buzzer.style["color"] = "var(--fg0)";
    };

    buzzer.onclick = (event) => {
        websocket.send(JSON.stringify({ action: "buzz" }));
    };

    events.buzzEvent = (event) => {
        let buzzList = event.value;
        if (buzzList.length > 0) {
            lockBuzzer();
        } else if (buzzerLocked) {
            unlockBuzzer();
        }
    };


    // betting

    events.requestBetEvent = (event) => {
        betInput.max = Math.max(event.score, 1000);
        betModal.style.display = shade.style.display = 'block';
        betInput.focus();
        betInput.select();
    };

    betForm.onsubmit = (event) => {
        websocket.send(JSON.stringify({ action: "submitBet", bet: betInput.value }));
        betModal.style.display = shade.style.display = 'none';
    };

    betInput.onblur = (event) => {
        setTimeout(() => window.scrollTo(0,0), 50)
    };


    // answering

    events.requestAnswerEvent = (event) => {
        answerModal.style.display = shade.style.display = 'block';
        answerInput.focus();
        answerInput.select();
    }

    answerForm.onsubmit = (event) => {
        websocket.send(JSON.stringify({ action: "submitAnswer", answer: answerInput.value }));
        answerModal.style.display = shade.style.display = 'none';
    };

    answerInput.onblur = (event) => {
        setTimeout(() => window.scrollTo(0,0), 50)
    };

});