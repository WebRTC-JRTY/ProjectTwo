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
  const video = document.createElement("video");

  const video_attrs = {
    autoplay: "",
    playsinline: "",
    poster: "images/placeholder.png",
  };
  figcaption.innerText = id;
  for (let attr in video_attrs) {
    video.setAttribute(attr, video_attrs[attr]);
  }
  figure.id = `peer-${id}`;
  figure.appendChild(video);
  figure.appendChild(figcaption);
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
  video.srcObject = stream;
}

function addStreamingMedia(id, stream) {
  const peer = $peers[id];
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

function establishCallFeatures(id) {
  registerRtcEvents(id);
  addStreamingMedia(id, $self.stream);
  // peer.chatChannel = peer.connection.createDataChannel("chat", {
  //   negotiated: true,
  //   id: 50,
  // });
  // peer.chatChannel.onmessage = function ({ data }) {
  //   appendMessage("peer", data);
  // };
}

function registerRtcEvents(id) {
  const peer = $peers[id];
  peer.connection.onnegotiationneeded = handleRtcNegotiation(id);
  peer.connection.onicecandidate = handleIceCandidate(id);
  peer.connection.ontrack = handleRtcTrack(id);
  peer.connection.ondatachannel = handleRtcDataChannel(id);
}

function handleRtcNegotiation(id) {
  return async function () {
    const peer = $peers[id];
    // no offers made if suppressing
    if ($self[id].isSuppressingInitialOffer) return;
    console.log("RTC negotiation needed...");
    // send SDP description
    $self[id].isMakingOffer = true;
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
        to: id,
        from: $self.id,
        signal: { description: peer.connection.localDescription },
      });
      $self[id].isMakingOffer = false;
    }
  };
}

function handleRtcDataChannel({ channel }) {
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

function handleIceCandidate(id) {
  return function ({ candidate }) {
    sc.emit("signal", {
      to: id,
      from: $self.id,
      signal: { candidate: candidate },
    });
  };
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
    displayStream(`#peer-${id}`, stream);
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
  initializeSelfAndPeerById(id, false);
  establishCallFeatures(id);
}

function handleScConnectedPeers(ids) {
  console.log(`Connected peer IDs: ${ids.join(", ")}`);
  for (let id of ids) {
    if (id !== $self.id) {
      initializeSelfAndPeerById(id, true);
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
  const peer = $peers[id];
  if (description) {
    console.log("Received SDP Signal:", description);

    if (description.type === "_reset") {
      resetAndRetryConnection();
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
      resetAndRetryConnection(peer);
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
  for (let id in $peers) {
    resetCall(id, true);
  }
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
