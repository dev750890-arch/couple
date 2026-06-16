// Import Firebase v9+ Modular SDKs from official CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your Provided Web App's Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDKfUsT0bbkIZ-DidZTLNKX-joDx-scb-Q",
  authDomain: "chatapp-chat19.firebaseapp.com",
  databaseURL: "https://chatapp-chat19-default-rtdb.firebaseio.com",
  projectId: "chatapp-chat19",
  storageBucket: "chatapp-chat19.appspot.com",
  messagingSenderId: "224517183138",
  appId: "1:224517183138:web:5afecda29bbd76e59429fb",
  measurementId: "G-36GSJQLBWX"
};

// Initialize Firebase & Realtime Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Application Global States
let map;
let myMarker = null;
let partnerMarker = null;
let watchId = null;
let roomId = null;
let myRole = ""; // "creator" or "joiner"
let myLocation = { lat: 0, lng: 0 };
let partnerLocation = { lat: 0, lng: 0 };

// DOM Elements
const setupPanel = document.getElementById('setup-panel');
const controlPanel = document.getElementById('control-panel');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const roomIdInput = document.getElementById('room-id-input');
const displayRoomId = document.getElementById('display-room-id');
const btnCopyId = document.getElementById('btn-copy-id');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnFocusPartner = document.getElementById('btn-focus-partner');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const distanceText = document.getElementById('distance-text');

/**
 * 1. Initialize Google Map with Modern Dark/Light Mode Styling
 */
window.initMap = function() {
    const defaultCenter = { lat: 16.8409, lng: 96.1735 }; // Default Center (Myanmar)
    
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 15,
        center: defaultCenter,
        disableDefaultUI: true,
        zoomControl: false,
        clickableIcons: false,
        styles: getMapStyles()
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        map.setOptions({ styles: getMapStyles() });
    });
};

/**
 * 2. Handle Room Creation Logic
 */
btnCreateRoom.addEventListener('click', () => {
    roomId = 'ROOM-' + Math.floor(100000 + Math.random() * 900000);
    myRole = "creator";
    
    const roomRef = ref(db, 'rooms/' + roomId);
    set(roomRef, {
        createdAt: Date.now(),
        creatorConnected: true,
        joinerConnected: false
    }).then(() => {
        startTracking();
        listenToRoom();
        switchToActiveUI();
    }).catch(err => alert("Firebase Setup Error: " + err.message));
});

/**
 * 3. Handle Joining Room Logic
 */
btnJoinRoom.addEventListener('click', () => {
    const inputVal = roomIdInput.value.trim().toUpperCase();
    if (!inputVal) return alert("ကျေးဇူးပြု၍ Room ID ကုဒ် ရိုက်ထည့်ပေးပါ။");

    const roomRef = ref(db, 'rooms/' + inputVal);
    
    get(roomRef).then((snapshot) => {
        if (snapshot.exists()) {
            roomId = inputVal;
            myRole = "joiner";
            
            update(roomRef, {
                joinerConnected: true
            }).then(() => {
                startTracking();
                listenToRoom();
                switchToActiveUI();
            });
        } else {
            alert("Room Code မှားယွင်းနေပါတယ် သို့မဟုတ် သက်တမ်းကုန်ဆုံးသွားပါပြီ။");
        }
    }).catch(err => alert("ချိတ်ဆက်မှု အဆင်မပြေပါ: " + err.message));
});

/**
 * 4. High-Accuracy Geolocation Live Tracking
 */
function startTracking() {
    if (!navigator.geolocation) {
        return alert("သင့် Browser သို့မဟုတ် Device က တည်နေရာစနစ်ကို ခွင့်မပြုပါ သို့မဟုတ် HTTPS မသုံးထားပါ။");
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            myLocation.lat = position.coords.latitude;
            myLocation.lng = position.coords.longitude;

            updateMyMarker();

            // Realtime Update Sync to Firebase
            const locationRef = ref(db, `rooms/${roomId}/${myRole}Location`);
            set(locationRef, {
                lat: myLocation.lat,
                lng: myLocation.lng,
                timestamp: Date.now()
            });

            calculateAndDisplayDistance();
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                alert("App အလုပ်လုပ်ရန်အတွက် တည်နေရာပြသခွင့်ကို (Allow) ပေးရန် လိုအပ်ပါတယ်။");
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

/**
 * 5. Sync Partner Data continuously
 */
function listenToRoom() {
    const partnerRole = myRole === "creator" ? "joiner" : "creator";
    
    // Listen for connection states
    const statusRef = ref(db, `rooms/${roomId}/${partnerRole}Connected`);
    onValue(statusRef, (snapshot) => {
        const isConnected = snapshot.val();
        const dot = connectionStatus.querySelector('.status-dot');
        if (isConnected) {
            dot.className = "status-dot connected";
            statusText.innerText = "Connected with Partner";
        } else {
            dot.className = "status-dot disconnected";
            statusText.innerText = "Partner Offline";
        }
    });

    // Listen for partner locations
    const partnerLocRef = ref(db, `rooms/${roomId}/${partnerRole}Location`);
    onValue(partnerLocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            partnerLocation.lat = data.lat;
            partnerLocation.lng = data.lng;
            
            updatePartnerMarker();
            calculateAndDisplayDistance();
        }
    });

    // Handle abrupt exit disconnects 
    const myStatusRef = ref(db, `rooms/${roomId}/${myRole}Connected`);
    onDisconnect(myStatusRef).set(false);
}

/**
 * 6. UI Markers Renderer
 */
function updateMyMarker() {
    const myLatLng = new google.maps.LatLng(myLocation.lat, myLocation.lng);
    
    if (!myMarker) {
        myMarker = new google.maps.Marker({
            position: myLatLng,
            map: map,
            title: "You",
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#0071e3",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3
            }
        });
        map.setCenter(myLatLng);
    } else {
        myMarker.setPosition(myLatLng);
    }
}

function updatePartnerMarker() {
    const partnerLatLng = new google.maps.LatLng(partnerLocation.lat, partnerLocation.lng);
    
    if (!partnerMarker) {
        partnerMarker = new google.maps.Marker({
            position: partnerLatLng,
            map: map,
            title: "Partner",
            icon: {
                path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: "#ff3b30",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2
            }
        });
    } else {
        partnerMarker.setPosition(partnerLatLng);
    }
}

/**
 * 7. Distance Matrix Calculation (Haversine Formula)
 */
function calculateAndDisplayDistance() {
    if (myLocation.lat === 0 || partnerLocation.lat === 0) return;

    const R = 6371e3; // Earth radius in meters
    const phi1 = myLocation.lat * Math.PI / 180;
    const phi2 = partnerLocation.lat * Math.PI / 180;
    const deltaPhi = (partnerLocation.lat - myLocation.lat) * Math.PI / 180;
    const deltaLambda = (partnerLocation.lng - myLocation.lng) * Math.PI / 180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    if (distance >= 1000) {
        distanceText.innerText = `${(distance / 1000).toFixed(2)} km`;
    } else {
        distanceText.innerText = `${Math.round(distance)} meters`;
    }
}

function switchToActiveUI() {
    setupPanel.classList.add('hidden');
    controlPanel.classList.remove('hidden');
    displayRoomId.innerText = roomId;
}

btnFocusPartner.addEventListener('click', () => {
    if (partnerLocation.lat !== 0) {
        const partnerLatLng = new google.maps.LatLng(partnerLocation.lat, partnerLocation.lng);
        map.panTo(partnerLatLng);
        map.setZoom(17);
    } else {
        alert("Partner ဆီက Location update မရသေးပါ သို့မဟုတ် Offline ဖြစ်နေပါတယ်။");
    }
});

btnCopyId.addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => {
        alert("Room ID ကို ကူးယူပြီးပါပြီ။ Partner ထံ ပေးပို့လိုက်ပါ။");
    });
});

btnDisconnect.addEventListener('click', () => {
    if (confirm("ချိတ်ဆက်မှုကို ဖြတ်တောက်ရန် သေချာပါသလား။")) {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        const myStatusRef = ref(db, `rooms/${roomId}/${myRole}Connected`);
        set(myStatusRef, false).then(() => {
            location.reload();
        });
    }
});

function getMapStyles() {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) {
        return [
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#2c2c2c" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
        ];
    } else {
        return [
            { "elementType": "geometry", "stylers": [{ "color": "#f5f5f7" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9e4ff" }] }
        ];
    }
}