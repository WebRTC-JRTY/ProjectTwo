"use strict";

// DOM Stuff
const url = "https://localhost:3000/";
const logo = document.querySelector(".logo");
const anchor = document.querySelectorAll("a");
logo.addEventListener("click", goHome);
console.log(anchor);

const anchorarray = Object.values(anchor);
console.log(anchorarray);
let links = [];
let cleanLinks = [];
let validLinks = [];
anchorarray.forEach((item) => {
  console.log(item.href);
  links.push(item.href);
});
console.log(links);

const validLink = links.filter((link) => url !== link);
console.log(validLink);

links.forEach((link) => {
  const cleanLink = link.split(".html")[0];
  console.log(cleanLink);
  cleanLinks.push(cleanLink);
});
console.log(cleanLinks);

anchorarray.forEach((item) => {
  const URL = item.href;
  console.log(URL);
  item.addEventListener("click", removeExtension);
});

function removeExtension(e) {
  const link = e.target;
  console.log(link);
  const cleanLink = link.split(".html")[0];
  window.history.replaceState(null, null, link);

  return;
}

function goHome() {
  window.location.href = "/";
}

/**
 *Global Variables: $self and $peer
 */
const $self = {
  rtcConfig: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  },
  mediaConstraints: { audio: false, video: true },
};

const $peers = {};
/**
 *  Signaling-Channel Setup
 */

const namespace = prepareNamespace(window.location.hash, true);

const sc = io.connect("/" + namespace, { autoConnect: false });

registerScCallbacks();

/**
 *  Begin Application-Specific Code
 */
/**
 *  User-Interface Setup
 */
document.querySelector("#header h1").innerText =
  "Welcome to Room #" + namespace;

document
  .querySelector("#call-button")
  .addEventListener("click", handleCallButton);

document
  .querySelector("#username-form")
  .addEventListener("submit", handleUsernameForm);

/**
 *  User Features and Media Setup*/

requestUserMedia($self.mediaConstraints);

/**
 *  User-Interface Functions and Callbacks
 */

function handleCallButton(event) {
  const callButton = event.target;
  if (callButton.className === "join") {
    console.log("Joining the call...");
    callButton.className = "leave";
    callButton.innerText = "Leave Call";
    joinCall();
  } else {
    console.log("Leaving the call...");
    callButton.className = "join";
    callButton.innerText = "Join Call";
    leaveCall();
  }
}
function joinCall() {
  sc.open();
}

function leaveCall() {
  sc.close();
  for (let id in $peers) {
    resetCall(id, true);
  }
}

function handleUsernameForm(event) {
  event.preventDefault();
  const form = event.target;
  const username = form.querySelector("#username-input").value;
  const figcaption = document.querySelector("#self figcaption");
  figcaption.innerText = username;
  $self.username = username;
  for (let id in $peers) {
    shareUsername(username, id);
  }
}
/**
 *  User-Media and Data-Channel Functions
 */

async function requestUserMedia(media_constraints) {
  $self.stream = new MediaStream();
  $self.media = await navigator.mediaDevices.getUserMedia(media_constraints);
  $self.stream.addTrack($self.media.getTracks()[0]);
  displayStream("#self", $self.stream);
}

function createVideoElement(id) {
  const figure = document.createElement("figure");
  const figcaption = document.createElement("figcaption");
  const video = document.createElement("video");
  const video_attrs = {
    autoplay: "",
    playsinline: "",
    poster: "img/placeholder.png",
  };
  figure.id = `peer-${id}`;
  figcaption.innerText = id;
  for (let attr in video_attrs) {
    video.setAttribute(attr, video_attrs[attr]);
  }
  figure.appendChild(video);
  figure.appendChild(figcaption);
  return figure;
}

function displayStream(selector, stream) {
  let video_element = document.querySelector(selector);
  if (!video_element) {
    let id = selector.split("#peer-")[1]; // #peer-abc123
    video_element = createVideoElement(id);
  }
  let video = video_element.querySelector("video");
  video.srcObject = stream;
  document.querySelector("#videos").appendChild(video_element);
}

function addStreamingMedia(id, stream) {
  const peer = $peers[id];
  if (stream) {
    for (let track of stream.getTracks()) {
      peer.connection.addTrack(track, stream);
    }
  }
}

function shareUsername(username, id) {
  const peer = $peers[id];
  const udc = peer.connection.createDataChannel(`username-${username}`);
}

/**
 *  Call Features & Reset Functions
 */

function initializeSelfAndPeerById(id, politeness) {
  $self[id] = {
    isPolite: politeness,
    isMakingOffer: false,
    isIgnoringOffer: false,
    isSettingRemoteAnswerPending: false,
  };
  $peers[id] = {
    connection: new RTCPeerConnection($self.rtcConfig),
  };
}

function establishCallFeatures(id) {
  registerRtcCallbacks(id);
  addStreamingMedia(id, $self.stream);
  if ($self.username) {
    shareUsername($self.username, id);
  }
}

function resetCall(id, disconnect) {
  const peer = $peers[id];
  const videoSelector = `#peer-${id}`;
  displayStream(videoSelector, null);
  peer.connection.close();
  if (disconnect) {
    document.querySelector(videoSelector).remove();
    delete $self[id];
    delete $peers[id];
  }
}
//
/*  WebRTC Functions and Callbacks
 */

function registerRtcCallbacks(id) {
  const peer = $peers[id];
  peer.connection.onconnectionstatechange = handleRtcConnectionStateChange(id);
  peer.connection.onnegotiationneeded = handleRtcConnectionNegotiation(id);
  peer.connection.onicecandidate = handleRtcIceCandidate(id);
  peer.connection.ontrack = handleRtcPeerTrack(id);
  peer.connection.ondatachannel = handleRtcDataChannel(id);
}

function handleRtcPeerTrack(id) {
  return function ({ track, streams: [stream] }) {
    console.log("Attempt to display media from peer...");
    displayStream(`#peer-${id}`, stream);
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

/**
 * =========================================================================
 *  End Application-Specific Code
 * =========================================================================
 */

/**
 *  Reusable WebRTC Functions and Callbacks
 */

function handleRtcConnectionNegotiation(id) {
  return async function () {
    const peer = $peers[id];
    if ($self[id].isSuppressingInitialOffer) return;
    try {
      $self[id].isMakingOffer = true;
      await peer.connection.setLocalDescription();
    } catch (e) {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
    } finally {
      sc.emit("signal", {
        to: id,
        from: $self.id,
        signal: { description: peer.connection.localDescription },
      });
      $self[id].isMakingOffer = false;
    }
  };
}

function handleRtcIceCandidate(id) {
  return function ({ candidate }) {
    console.log("MY ICE CANDIDATE", candidate);
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

/**
 *  Signaling-Channel Functions and Callbacks
 */

function registerScCallbacks() {
  sc.on("connect", handleScConnect);
  sc.on("connected peer", handleScConnectedPeer);
  sc.on("connected peers", handleScConnectedPeers);
  sc.on("disconnected peer", handleScDisconnectedPeer);
  sc.on("signal", handleScSignal);
}

function handleScConnect() {
  console.log("Successfully connected to the signaling server!");
  $self.id = sc.id;
}

function handleScConnectedPeer(id) {
  console.log("Heard new connected peer ID:", id);
  initializeSelfAndPeerById(id, false);
  establishCallFeatures(id);
}

function handleScConnectedPeers(ids) {
  console.log("Received already-connected peer IDs", ids.join(", "));
  for (let id of ids) {
    if (id !== $self.id) {
      initializeSelfAndPeerById(id, true);
      establishCallFeatures(id);
    }
  }
}

function handleScDisconnectedPeer(id) {
  console.log("Heard new disconnected peer ID:", id);
  resetCall(id, true);
}

function resetAndRetryConnection(id) {
  const isPolite = $self[id].isPolite;
  resetCall(id, false);
  initializeSelfAndPeerById(id, isPolite);
  $self[id].isSuppressingInitialOffer = isPolite;

  establishCallFeatures(id);

  if (isPolite) {
    sc.emit("signal", {
      to: id,
      from: $self.id,
      signal: { description: { type: "_reset" } },
    });
  }
}

async function handleScSignal({ from, signal: { description, candidate } }) {
  const id = from;
  const peer = $peers[id];
  if (description) {
    if (description.type === "_reset") {
      resetAndRetryConnection(id);
      return;
    }

    const readyForOffer =
      !$self[id].isMakingOffer &&
      (peer.connection.signalingState === "stable" ||
        $self[id].isSettingRemoteAnswerPending);

    const offerCollision = description.type === "offer" && !readyForOffer;

    $self[id].isIgnoringOffer = !$self[id].isPolite && offerCollision;

    if ($self[id].isIgnoringOffer) {
      return;
    }

    $self[id].isSettingRemoteAnswerPending = description.type === "answer";
    try {
      console.log(
        "Signaling state on incoming description:",
        peer.connection.signalingState
      );
      await peer.connection.setRemoteDescription(description);
    } catch (e) {
      resetAndRetryConnection(id);
      return;
    }
    $self[id].isSettingRemoteAnswerPending = false;

    if (description.type === "offer") {
      try {
        await peer.connection.setLocalDescription();
      } catch (e) {
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
      } finally {
        sc.emit("signal", {
          to: id,
          from: $self.id,
          signal: { description: peer.connection.localDescription },
        });
        $self[id].isSuppressingInitialOffer = false;
      }
    }
  } else if (candidate) {
    // Handle ICE candidates
    try {
      console.log(`INCOMING ICE CANDIDATE for ${id}`, candidate);
      await peer.connection.addIceCandidate(candidate);
    } catch (e) {
      // Log error unless $self[id] is ignoring offers
      // and candidate is not an empty string
      if (!$self[id].isIgnoringOffer && candidate.candidate.length > 1) {
        console.error("Unable to add ICE candidate for peer:", e);
      }
    }
  }
}

/**
 *  Utility Functions
 */

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

function resetObjectKeys(obj) {
  for (let key of Object.keys(obj)) {
    delete obj[key];
  }
}

if (hello) console.log("hi");

function homebFunc() {
  window.location.href = "";
}
