"use strict";

document.getElementById("t1").addEventListener("click", changeLocation);
document.getElementById("t2").addEventListener("click", changeLocation);
document.getElementById("t3").addEventListener("click", changeLocation);
document.getElementById("t4").addEventListener("click", changeLocation);

function changeLocation(){
  window.location.href = "../room.html";
}

// DOM Stuff
const logo = document.querySelector(".logo");
logo.addEventListener("click", goHome);

function goHome() {
  window.location.href = "/";
}

function homebFunc() {
  window.location.href = "";
}
