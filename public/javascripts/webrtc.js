"use strict";

const TEXT_CHAT = "textChat";
const VIDEO_CHAT = "videoChat";

// Self and Peer Objects
const $self = {
  rtcConfig: null,
  constraints: {
    audio: false,
    video: true,
  },
  [VIDEO_CHAT]:{

  },

  [TEXT_CHAT]:{
  },
};

const $peers = {
  [VIDEO_CHAT]:{},
  [TEXT_CHAT]:{},
};

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
  const video = document.createElement("video");

  const video_attrs = {
    autoplay: "",
    playsinline: "",
    poster: "images/placeholder.png",
  };
  figcaption.innerText = id;
  figcaption.className = "name";
  for (let attr in video_attrs) {
    video.setAttribute(attr, video_attrs[attr]);
  }
  figure.id = `peer-${id}`;
  figure.appendChild(video);
  figure.appendChild(figcaption);
  figure.classList.add("video-container-icon");
  return figure;
}

function displayStream(selector, stream) {
  let videoElement = document.querySelector(selector);
  if (!videoElement) {
    let id = selector.split("#peer-")[1];
    videoElement = createVideoElement(id);
  }
  document.querySelector("#videos").appendChild(videoElement);
  let video = videoElement.querySelector("video");
  video.id = "self";
  video.srcObject = stream;
}

function addStreamingMedia(id, stream) {
  const peer = $peers[VIDEO_CHAT][id];
  if (stream) {
    for (let track of stream.getTracks()) {
      peer.connection.addTrack(track, stream);
    }
  }
}

// WebRTC Events

function initializeSelfAndPeerById(type, id, hostness) {
  $self[type][id] = {
    isHost: hostness,
    isMakingOffer: false,
    isIgnoringOffer: false,
    isSettingRemoteAnswerPending: false,
  };
  $peers[type][id] = {
    connection: new RTCPeerConnection($self.rtcConfig),
  };
}

function establishCallFeatures(id) {
  registerRtcEvents(VIDEO_CHAT, id);
  addStreamingMedia(id, $self.stream);
  addChatChannel(id);
  if ($self.username) {
    shareUsername($self.username, id);
  }
}

function registerRtcEvents(type, id, handleRtcDataChannel) {
  const peer = $peers[type][id];
  peer.connection.onnegotiationneeded = () => handleRtcNegotiation(type, id);
  peer.connection.onicecandidate = ({ candidate}) => handleIceCandidate(type, id, candidate);
  if(type === VIDEO_CHAT){
    peer.connection.ontrack = handleRtcTrack(id);
  }else{
    peer.connection.ondatachannel = ({channel}) => handleRtcDataChannel(type, id, chanel);;
  }
}

function handleRtcNegotiation(type, id) {
  return async function () {
    const myself = $self[type][id]
    const peer = $peers[type][id];
    // no offers made if suppressing
    if ($self[id].isSuppressingInitialOffer) return;
    console.log("RTC negotiation needed...");
    // send SDP description
    myself.isMakingOffer = true;
    try {
      // modern setLocalDescription
      await peer.connection.setLocalDescription();
    } catch (e) {
      // fallback for old browsers
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
    } finally {
      // ^...
      sc.emit("signal", {
        to: id, type,
        from: $self.id,
        description: peer.connection.localDescription,
      });
      myself.isMakingOffer = false;
    }
  };
}

function handleRtcDataChannel(id) {
  return function ({ channel }) {
    const label = channel.label;
    console.log(`Data channel added for ${label}`);
    if (label.startsWith("username-")) {
      document.querySelector(`#peer-${id} figcaption`).innerText =
        label.split("username-")[1];
      channel.onopen = function () {
        channel.close();
      };
    }
  };
}

function handleIceCandidate(type, id, candidate) {
    sc.emit("signal", {
      to: id, type, candidate,
      from: $self.id,
    });
}

function handleRtcConnectionStateChange(id) {
  return function () {
    const connectionState = $peers[id].connection.connectionState;
    document.querySelector(`#peer-${id}`).className = connectionState;
  };
}

function handleRtcTrack(id) {
  return function ({ track, streams: [stream] }) {
    console.log("Attempt to display media from peer...");
    // attach our track to the DOM
    displayStream(id, stream);
  };
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
      initializeSelfAndPeerById(VIDEO_CHAT, id, true);
      establishCallFeatures(id);

      initializeSelfAndPeerById(TEXT_CHAT, id, true);
      establishCallFeatures(id);
}

function handleScConnectedPeers(ids) {
  console.log(`Connected peer IDs: ${ids.join(", ")}`);
  for (let id of ids) {
    if (id !== $self.id) {
      initializeSelfAndPeerById(VIDEO_CHAT, id, true);
      establishCallFeatures(id);

      initializeSelfAndPeerById(TEXT_CHAT, id, true);
      establishCallFeatures(id);
    }
  }
}

function handleScDisconnectedPeer(id) {
  console.log("Disconnected peer ID:", id);
  resetCall(id, true);
}

async function handleScSignal({ from, signal: { description, candidate } }) {
  console.log("Heard signal event!");
  const id = from;
  const peer = $peers[type][id];
  if (description) {
    console.log("Received SDP Signal:", description);

    if (description.type === "_reset") {
      resetAndRetryConnection(id);
      return;
    }

    const readyForOffer =
      !$self[id].isMakingOffer &&
      (peer.connection.signalingState === "stable" ||
        $self[id].isSettingRemoteAnswerPending);

    const offerCollision = description.type === "offer" && !readyForOffer;

    $self[id].isIgnoringOffer = !$self[id].isHost && offerCollision;

    if ($self[id].isIgnoringOffer) return;

    $self[id].isSettingRemoteAnswerPending = description.type === "answer";
    console.log(
      "Signaling state on incoming description:",
      peer.connection.signalingState
    );
    try {
      await peer.connection.setRemoteDescription(description);
    } catch (e) {
      // if we cant setRemoteDescription, then reset
      resetAndRetryConnection(id);
      return;
    }

    if (description.type === "offer") {
      try {
        // modern setLocalDescription
        await peer.connection.setLocalDescription();
      } catch (e) {
        // fallback for old browsers
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(offer);
      } finally {
        // ^...
        sc.emit("signal", {
          to: id,
          from: $self.id,
          signal: {
            description: peer.connection.localDescription,
          },
        });
        // host does'nt have to suppress initial offers
        $self[id].isSuppressingInitialOffer = false;
      }
    } else if (candidate) {
      console.log("Receieved ICE candidate:", candidate);
    }
  } else if (candidate) {
    console.log("Received ICE candidate:", candidate);

    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (e) {
      if (!$self[id].isIgnoringOffer) {
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

function establishChatFeatures(id){
  registerRtcEvents(TEXT_CHAT, id, textChatOnDataChannel);
  const peer = $peers[TEXT_CHAT][id];
  peer.dataChannel = peer.connection.createDataChannel(TEXT_CHAT,{
    negotiated: true,
    id: $self.controlTextId,
  })
  peer.dataChannel.onmessage = handleTextMessage;
}

const chat_form = document.querySelector(".chat-form");
chat_form.addEventListener("submit", handleTextMessage);

function handleTextMessage( {data} , sender){
  console.log('Message: ', data);
  const log = document.querySelector('#chat-log');
  const li = document.createElement('li');
  li.innerText = data;
  li.className = sender;
  log.appendChild(li);
}

function handleChatForm(e) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector(".enter-message");
  const message = input.value;

  appendMessage("self", message);

  for (let peer in $peers[TEXT_CHAT]) {
    $peers[TEXT_CHAT][peerID].chatChannel.send(message);
  }

  // Reset chat form when submit
  input.value = "";
}

function handleUsernameForm(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.querySelector("#username-input").value;
  const figcaption = document.querySelector(".name");
  figcaption.innerText = username;
  $self.username = username;
  for (let id in $peers) {
    shareUsername(username, id);
  }
}

function appendMessage(sender, message) {
  const log = document.querySelector(".chat");
  const li = document.createElement("li");
  li.innerText = message;
  li.className = sender;

  log.appendChild(li);
  if (log.scrollTo) {
    log.scrollTo({
      top: log.scrollHeight,
      behavior: "smooth",
    });
  } else {
    log.scrollTop = log.scrollHeight;
  }
}

function shareUsername(username, id) {
  const peer = $peers[id];
  const udc = peer.connection.createDataChannel(`username-${username}`);
}

// Data Channels
function addChatChannel(id) {
  registerRtcEvents(TEXT_CHAT, id);
  const peer = $peers[TEXT_CHAT][id];
  peer.chatChannel = peer.connection
  .createDataChannel("chat", {
    negotiated: true,
    id: 50,
  });
  peer.chatChannel.onmessage = function ({ data }) {
    appendMessage("peer", data);
  };
  peer.chatChannel.onclose = function ({ data }) {
    console.log("Chat channel closed.");
  };
}

// DOM Elements
const button = document.querySelector(".call-button");
const leave = document.querySelector(".leave");
const spotify = document.querySelector(".start-listening");
const username_form = document.querySelector("#username-form");

button.addEventListener("click", handleButton);
username_form.addEventListener("submit", handleUsernameForm);
spotify.addEventListener("click", startSpotify);
leave.addEventListener("click", leaveMeeting);

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
  for (let id in $peers) {
    resetCall(id, true);
  }
}

function leaveMeeting() {
  window.location.href = "/";
}

function resetCall(id, disconnect) {
  const peer = $peers[id];
  const videoSelector = `#peer-${id}`;
  displayStream(`#peer-${id}`, null);
  peer.connection.close();
  if (disconnect) {
    document.querySelector(videoSelector).remove();
    delete $self[id];
    delete $peers[id];
  }
}

function startSpotify() {
  window.location.href = "spotify";
}

function resetAndRetryConnection(id) {
  const isHost = $self[id].isHost;
  // host peer suppresses initial offer
  resetCall(id, false);
  initializeSelfAndPeerById(id, isHost);
  $self[id].isSuppressingInitialOffer = isHost;

  establishCallFeatures(id);

  // Let the remote peer know we're resetting
  if (isHost) {
    sc.emit("signal", {
      to: id,
      from: $self.id,
      signal: {
        description: {
          type: "_reset",
        },
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
      to: id,
      from: $self.id,
      signal: {
        description: $peer.connection.localDescription,
      },
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
