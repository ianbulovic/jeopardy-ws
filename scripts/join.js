import {websocket} from './ws.js'

window.addEventListener("DOMContentLoaded", () => {
    // relevant DOM elements
    var joinButton = document.querySelector(".join-button");
    var joinModal  = document.querySelector(".join-modal");
    var shade      = document.querySelector(".shade");
    var nameInput  = document.querySelector(".name-input");
    var goButton   = document.querySelector(".go-button");
    var hostButton = document.querySelector(".host-button");

    joinButton.onclick = (event) => {
        joinModal.style.display = shade.style.display = 'block';
        nameInput.focus();
        nameInput.select();
    };

    nameInput.addEventListener("keyup", (event) => {
        event.preventDefault();
        if (event.key === "Enter") {
            goButton.click();
        }
    });

    nameInput.onblur = (event) => {
        setTimeout(() => window.scrollTo(0,0), 50)
    };

    goButton.onclick = (event) => {
        websocket.send(JSON.stringify({ action: "join", name: nameInput.value}));
    };

    shade.onclick = (event) => {
        if (joinModal.style.display === 'block' && !event.target.closest(".join-modal")) {
            joinModal.style.display = shade.style.display = 'none';
        }
    };

    hostButton.onclick = (event) => {
        websocket.send(JSON.stringify({ action: "host"}));
    };

});