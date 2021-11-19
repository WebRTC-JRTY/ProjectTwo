"use strict";

// Self and Peer Objects
const $self = {
  rtcConfig: null,
  constraints: {
    audio: false,
    video: true,
  },
};

const $peers = {};

requestUserMedia($self.constraints);

// On page load, asks for permission to use audio/video.
async function requestUserMedia(constraints) {
  const video = document.querySelector("#self");
  $self.stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = $self.stream;
}

// User-Media/DOM
function createVideoElement(id) {
  const figure = document.createElement("figure");
  const figcaption = document.createElement("figcaption");
  const video = documnent.createElement("video");

  const video_attrs = {
    autoplay: "",
    playsinline: "",
    poster: "images/placeholder.png",
  };
  figcaption.innerText = id;
  for (let attrs in video_attrs) {
    video.setAttribute(attr, video_attrs[attr]);
  }
  figure.appendChild(video);
  figure.appendChild(figcaption);
  return figure;
}

function displayStream(selector, stream) {
  const videoElement = document.querySelector(selector);
  if (!videoElement) {
    let id = selector.split("#peer-")[1];
    videoElement = createVideoElement(id);
  }
  let video = videoElement.querySelector("video");
  video.srcObject = stream;
}

function addStreamingMedia(peer, stream) {
  if (stream) {
    for (let track of stream.getTracks()) {
      peer.connection.addTrack(track, stream);
    }
  }
}

// WebRTC Events

function initializeSelfAndPeerById(id, hostness) {
  $self[id] = {
    isHost: hostness,
    isMakingOffer: false,
    isIgnoringOffer: false,
    isSettingRemoteAnswerPending: false,
  };
  $peers[id] = {
    connection: new RTCPeerConnection($self.rtcConfig),
  };
}

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

function registerRtcEvents(id) {
  const peer = $peers[id];
  peer.connection.onnegotiationneeded = handleRtcNegotiation;
  peer.connection.onicecandidate = handleIceCandidate;
  peer.connection.ontrack = handleRtcTrack;
  peer.connection.ondatachannel = handleRtcDataChannel;
}

async function handleRtcNegotiation() {
  // no offers made if suppressing
  if ($self[id].isSuppressingInitialOffer) return;
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
  document.querySelector(".peer").className = channel.label;
}

function handleIceCandidate({ candidate }) {
  sc.emit("signal", {
    to: id,
    from: $self.id,
    signal: { candidate: candidate },
  });
}

function handleRtcConnectionStateChange(id) {
  return function () {
    const connectionState = $peers[id].connection.connectionState;
    document.querySelector(`#peer-${id}`).className = connectionState;
  };
}

function handleRtcTrack({ track, streams: [stream] }) {
  // attach our track to the DOM
  displayStream(".peer", stream);
}

// Socket IO
const namespace = prepareNamespace(window.location.hash, true);

const sc = io.connect("/" + namespace, { autoConnect: false });

registerScEvents();

// Socket IO Signaling Channel Events

function registerScEvents() {
  sc.on("connect", handleScConnect);
  sc.on("connected peer", handleScConnectedPeer);
  sc.on("connected peers", handleScConnectedPeers);
  sc.on("signal", handleScSignal);
  sc.on("disconnected peer", handleScDisconnectedPeer);
}

function handleScConnect() {
  console.log("Successfully connected to signaling channel!");
  $self.id = sc.id;
  console.log(`Self ID: ${$self.id}`);
}

function handleScConnectedPeer(id) {
  console.log("Connected peer ID:", id);
  initializeSelfAndPeerById(id, false);
}

function handleScConnectedPeers(ids) {
  console.log(`Connected peer IDs: ${ids.join(", ")}`);
  for (let id of ids) {
    initializeSelfAndPeerById(id, true);
  }
}

function handleScDisconnectedPeer(id) {
  console.log("Disconnected peer ID:", id);
}

async function handleScSignal({ description, candidate }) {
  console.log("Heard signal event!");
  if (description) {
    console.log("Received SDP Signal:", description);

    if (description.type === "_reset") {
      resetAndRetryConnection();
      return;
    }

    const readyForOffer =
      !$self.isMakingOffer &&
      ($peer.connection.signalingState === "stable" ||
        $self.isSettingRemoteAnswerPending);

    const offerCollision = description.type === "offer" && !readyForOffer;

    $self.isIgnoringOffer = !$self.isHost && offerCollision;

    if ($self.isIgnoringOffer) return;

    $self.isSettingRemoteAnswerPending = description.type === "answer";
    console.log(
      "Signaling state on incoming description:",
      $peer.connection.signalingState
    );
    try {
      await $peer.connection.setRemoteDescription(description);
    } catch (e) {
      // if we cant setRemoteDescription, then reset
      resetAndRetryConnection($peer);
      return;
    }

    if (description.type === "offer") {
      try {
        // modern setLocalDescription
        await $peer.connection.setLocalDescription();
      } catch (e) {
        // fallback for old browsers
        const answer = await $peer.connection.createAnswer();
        await $peer.connection.setLocalDescription(offer);
      } finally {
        // ^...
        sc.emit("signal", {
          description: $peer.connection.localDescription,
        });
        // host does'nt have to suppress initial offers
        $self.isSuppressingInitialOffer = false;
      }
    } else if (candidate) {
      console.log("Receieved ICE candidate:", candidate);
    }
  } else if (candidate) {
    console.log("Received ICE candidate:", candidate);

    try {
      await $peer.connection.addIceCandidate(candidate);
    } catch (e) {
      if (!$self.isIgnoringOffer) {
        console.error("Cannot add ICE candidadte for peer", e);
      }
    }
  }
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
  registerRtcEvents($peer);
  establishCallFeatures($peer);
}

function leaveCall() {
  button.classList.remove("leave");
  button.innerText = "Join Room";
  sc.close();
  resetCall($peer);
}

function resetCall(peer) {
  $peer.connection.close();
  $peer.connection = new RTCPeerConnection($self.rtcConfig);
}

function resetAndRetryConnection(peer) {
  resetCall(peer);
  $self.isMakingOffer = false;
  $self.isIgnoringOffer = false;
  $self.isSettingRemoteAnswerPending = false;

  // host peer suprpresses initial offer
  $self.isSuppressingInitialOffer = $self.isHost;
  registerRtcEvents(peer);
  establishCallFeatures(peer);

  // Let the remote peer know we're resetting
  if ($self.isHost) {
    sc.emit("signal", {
      description: {
        type: "_reset",
      },
    });
  }
}

// Utility Functions for WebRTC
async function handleFallbackRtc(offerType) {
  try {
    // modern setLocalDescription
    await $peer.connection.setLocalDescription();
  } catch (e) {
    // fallback for old browsers
    const offer = await $peer.connection.offerType;
    await $peer.connection.setLocalDescription(offer);
  } finally {
    // ^...
    sc.emit("signal", {
      description: $peer.connection.localDescription,
    });
  }
}

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
