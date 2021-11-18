"use strict";

// Self and Peer Objects
const $self = {
  rtcConfig: null,
  constraints: {
    audio: false,
    video: true,
  },
  isHost: false,
  isMakingOffer: false,
  isIgnoringOffer: false,
  isSettingRemoteAnswerPending: false,
};

requestUserMedia($self.constraints);

// On page load, asks for permission to use audio/video.
async function requestUserMedia(constraints) {
  const video = document.querySelector("#self");
  $self.stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = $self.stream;
}

// User-Media/DOM
function displayStream(selector, stream) {
  const video = document.querySelector(selector);
  video.srcObject = stream;
}

// WebRTC Events
function establishCallFeatures(peer) {
  peer.connection.addTrack($self.stream.getTracks()[0], $self.stream);
  peer.chatChannel = peer.connection.createDataChannel("chat", {
    negotiated: true,
    id: 50,
  });
  peer.chatChannel.onmessage = function ({ data }) {
    appendMessage("peer", data);
  };
}

function registerRtcEvents(peer) {
  peer.connection.onnegotiationneeded = handleRtcNegotiation;
  peer.connection.onicecandidate = handleIceCandidate;
  peer.connection.ontrack = handleRtcTrack;
  peer.connection.ondatachannel = handleRtcDataChannel;
}

async function handleRtcNegotiation() {
  // no offers made if suppressing
  if ($self.isSuppressingInitialOffer) return;
  console.log("RTC negotiation needed...");
  // send SDP description
  $self.isMakingOffer = true;
  try {
    // modern setLocalDescription
    await $peer.connection.setLocalDescription();
  } catch (e) {
    // fallback for old browsers
    const offer = await $peer.connection.createOffer();
    await $peer.connection.setLocalDescription(offer);
  } finally {
    // ^...
    sc.emit("signal", {
      description: $peer.connection.localDescription,
    });
  }
  $self.isMakingOffer = false;
}

function handleRtcDataChannel({ channel }) {
  console.log("Heard channel", channel.label, "with ID", channel.id);
  document.querySelector("#peer").className = channel.label;
}

function handleIceCandidate({ candidate }) {
  sc.emit("signal", {
    candidate: candidate,
  });
}

function handleRtcTrack({ track, streams: [stream] }) {
  // attach our track to the DOM
  displayStream("#peer", stream);
}

// Socket IO
const namespace = prepareNamespace(window.location.hash, true);

const sc = io.connect("/" + namespace, { autoConnect: false });

registerScEvents();

// Socket IO Signaling Channel Events

function registerScEvents() {
  sc.on("connect", handleScConnect);
  sc.on("connected peer", handleScConnectedPeer);
  sc.on("disconnected peer", handleScDisconnectedPeer);
}

function handleScConnect() {
  console.log("Connected to signaling channel!");
}

function handleScConnectedPeer() {
  console.log("Heard connected peer event!");
}

function handleScDisconnectedPeer() {
  console.log("Heard disconnected peer event!");
}

// DOM Events
function handleButton(e) {
  const button = e.target;
  if (button.innerText === "Join Room") {
    joinCall();
  } else {
    leaveCall();
  }
}

function handleChatForm(e) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector(".enter-message");
  const message = input.value;

  appendMessage("self", message);
}

function appendMessage(sender, message) {
  const log = document.querySelector(".chat");
  const li = document.createElement("li");
  li.innerText = message;
  li.className = sender;

  log.appendChild(li);
}

// DOM Elements
const button = document.querySelector(".call-button");
const chat_form = document.querySelector(".chat-form");

button.addEventListener("click", handleButton);
chat_form.addEventListener("submit", handleChatForm);

document.querySelector(".room-number").innerText = `#${namespace}`;
function joinCall() {
  button.classList.add("leave");
  button.innerText = "Leave Room";
  sc.open();
}

function leaveCall() {
  button.classList.remove("leave");
  button.innerText = "Join Room";
  sc.close();
}
// WebRTC Events

// Utility Functions for SocketIO
function prepareNamespace(hash, set_location) {
  let ns = hash.replace(/^#/, ""); // remove # from the hash
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(ns)) {
    console.log(`Checked existing namespace '${ns}'`);
    return ns;
  }

  ns = generateRandomAlphaString("-", 3, 4, 3);

  console.log(`Created new namespace '${ns}'`);
  if (set_location) window.location.hash = ns;
  return ns;
}

function generateRandomAlphaString(separator, ...groups) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let ns = [];
  for (let group of groups) {
    let str = "";
    for (let i = 0; i < group; i++) {
      str += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    ns.push(str);
  }
  return ns.join(separator);
}
