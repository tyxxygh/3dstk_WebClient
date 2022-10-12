$(function(){
  //var localIP = '10.13.7.68';
  var localIP = '10.13.8.88';
  //var localIP = '192.168.2.10';
  function logTime()
  {
      var curtime = (new Date).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', fractionalSecondDigits: 3 });
      return  ' @' + curtime.toString();
  }

  URL = window.webkitURL || window.URL;

  // Use this switch to determing whether Turn
  // server credentials are parsed from sever
  // connection offer, or declared here in config.
  var parseTurnFromOffer = true;

  // This config is used when parsing Turn credentials
  var pcConfigNone = {
    'iceServers': [],
    'iceTransportPolicy': 'relay'
  }

  // Using this config if you require a TURN server for VPN/Proxy networks. 
  // See https://github.com/CatalystCode/3DStreamingToolkit/wiki/TURN-Service  
  var pcConfigStatic = {
    'iceServers': [{
        //'urls': 'turn:192.168.2.10:5349',
        'urls': 'turn:'+localIP+':5349',
        'username': 'king',
        'credential': 'king@123',
        'credentialType': 'password'
    },
    {
		'urls': 'stun:'+localIP+':3478'
      //'urls': 'stun:stun.l.google.com:19302'
    }],
    'iceTransportPolicy': 'relay'
  };

  var pcConfigSTUNStatic = {
    'iceServers': [{
		'urls': 'stun:'+localIP+':3478'
      //'urls': 'stun:stun.l.google.com:19302'
    }]
  };

  var pcConfigDynamic = {
    'iceServers': [{
        'urls': 'turn:turnserveruri:5349',
        'credentialType': 'password'
    }],
    'iceTransportPolicy': 'relay'
  };

  var defaultSignalingServerUrl = 'http://'+ localIP + ':21409'

  var aadConfig = {
    clientID: 'clientid',
    authority: 'https://login.microsoftonline.com/tfp/tenant.onmicrosoft.com/b2c_1_signup',
    b2cScopes: ['openid']
  };

  var identityManagementConfig = {
    turnCredsUrl: 'https://identitymanagementapi'
  };

  var streamingClient;
  var remoteVideoElement = null;

  var navTransform = matCreate();
  var navHeading = 0.0;
  var navPitch = 0.0;
  var navLocation = [ 0.0, 0.0, 0.0 ];

  var isMouseDown = false;
  var mouseDownX = 0;
  var mouseDownY = 0;

  var downPitch = 0.0;
  var downHeading = 0.0;
  var downLocation = [ 0.0, 0.0, 0.0 ];

  var pcOptions = {
    optional: [
        { DtlsSrtpKeyAgreement: true }
    ]
  }
  var mediaConstraints = {
    'mandatory': {
        'OfferToReceiveAudio': false,
        'OfferToReceiveVideo': true
    }
  };
  var accessToken;

  // use pcConfigStatic if not parsing, otherwise empty
  // use pcConfigSTUNStatic if no VPN/Proxy networks are required
  //var pcConfig = parseTurnFromOffer ? pcConfigNone : pcConfigStatic;
  var pcConfig = pcConfigSTUNStatic;//pcConfigStatic;//pcConfigSTUNStatic;

  RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection || RTCPeerConnection;
  RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription || RTCSessionDescription;
  RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate || RTCIceCandidate;
  getUserMedia = navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
  URL = window.webkitURL || window.URL;


  document.getElementById('server').value = defaultSignalingServerUrl;

  var clientApplication = new Msal.UserAgentApplication(aadConfig.clientID, aadConfig.authority, function (errorDesc, token, error, tokenType) {
  });

  function login() {
    clientApplication.loginPopup(aadConfig.b2cScopes).then(function (idToken) {
        clientApplication.acquireTokenSilent(aadConfig.b2cScopes).then(function (token) {
            accessToken = token;
            var userName = clientApplication.getUser().name;
            console.log(clientApplication.getUser());
            console.log("User '" + userName + "' logged-in");
            document.getElementById('authlabel').innerText = 'Hello ' + userName;

            if (document.getElementById('turnTempPasswordEnabled').checked) {
                var loginRequest = new XMLHttpRequest();
                loginRequest.onreadystatechange = function (event) {
                    if (loginRequest.readyState == 4 && loginRequest.status == 200) {
                        var data = JSON.parse(event.target.response);
                        console.log('Identity management returned', data);

                        pcConfig = pcConfigDynamic;
                        pcConfig.iceServers[0].username = data.username;
                        pcConfig.iceServers[0].credential = data.password;
                    }
                };
                loginRequest.open('GET', identityManagementConfig.turnCredsUrl, true);
                loginRequest.setRequestHeader('Authorization', 'Bearer ' + accessToken);
                loginRequest.send();
            }
        }, function (error) {
            clientApplication.acquireTokenPopup(aadConfig.b2cScopes).then(function (accessToken) {
                //updateUI();
            }, function (error) {
                console.log('Error acquiring the popup:\n' + error);
            });
        })

    }, function (error) {
        console.log('Error during login:\n' + error);
    });
  }

  function onRemoteStreamAdded(event) {
    document.getElementById('renderers').style.display = 'none';
    remoteVideoElement = document.getElementById('remote-video'); 
	remoteVideoElement.style.cssText = "\
		-moz-transform: scale(1, -1); \
		-webkit-transform: scale(1, -1); \
		-o-transform: scale(1, -1); \
		transform: scale(1, -1); \
		filter: FlipV; \
		object-fit: fill;";

    try{
      remoteVideoElement.src = URL.createObjectURL(event.stream);
    } 
    catch (error) {
      remoteVideoElement.srcObject = event.stream;
    }
    finally{
      remoteVideoElement.play();
    }
   }

  function joinPeer() {
    try {
        // get the currently selected peer from the peerList
        var list = document.getElementById('peerList');
		var seleted = list[list.selectedIndex];
        var peerName = seleted.value;
		var peerId = seleted.peerId;
		console.log("selected peer:" + peerName + "(" + peerId +")" + logTime());
		var pc = streamingClient.joinPeer(peerId);
		console.log("==========>" + peerName + "(" + peerId +"). Join peer [OK]." + logTime());
        //var pc = streamingClient.joinPeer(streamingClient.getPeerIdByName(peerName));

    } catch (e) {
		    console.log("=========> Join peer [FAILED]" + logTime());
        //trace('error ' + e.description);
        console.error(e.name + ': ' + e.message);
    }
  }

  function btnID(event)
  {
	var btn = "nobtn";
	if(event.which == 1)
	  btn = "lbtn";
    if(event.which == 2)
	  btn="mbtn";
    else if(event.which == 3)
	  btn="rbtn";
    return btn;
  }

  function navMouseEventHandler(event)
  {
  	sendMouseEvent(event);
  	event.preventDefault(); 
  }
  
  var lastX = 0;
  var lastY = 0;
  var shoudMirrorUpSideDown = false;
  function sendMouseEvent(eventType, x, y, ctrl, shift, alt, delta)
  {
    if (streamingClient && remoteVideoElement != null)
    {
		var eventType = btnID(event) + event.type;
		var x = event.clientX;
		var y = event.clientY;
		var ctrl = event.ctrlKey;
		var alt = event.altKey;
		var shift = event.shiftKey;
		var delta = 0;
		if(event.type === "mousewheel")
		{
		 delta = event.wheelDelta;
		}
		
		var ratioX = 1.0 * remoteVideoElement.videoWidth/remoteVideoElement.width;
		var ratioY = 1.0 * remoteVideoElement.videoHeight/remoteVideoElement.height;
		
		var orgX = parseInt((x - remoteVideoElement.offsetLeft)*ratioX);
		var localY = y; 
		if(shoudMirrorUpSideDown)
		{
			localY = remoteVideoElement.height - y;
		}

		orgY = parseInt((localY - remoteVideoElement.offsetTop)*ratioY);

		
		//移除重复的mouseMove以降低交互延时。
		if(x == orgX && y == orgY && eventType == "mousemove")
			return;
		lastX = orgX;
		lastY = orgY;
		
        var data = 
		{
			'eventType': eventType,
			'x' : orgX,
			'y' : orgY,
			'delta' : delta,
			'ctrl': ctrl,
			'shift' : shift,
			'alt': alt
		};
		
        var msg =
        {
            'type' : 'remoteInput',
            'body' : data
        }
		//console.log(data.eventType);
        streamingClient.sendInputChannelData(msg);
    }
  }
  
  function navOnSize()
  {
	   if (streamingClient)
	   {
		  var remoteVideoElement = document.getElementById('remote-video');
		  var width = remoteVideoElement.width;
		  var height = remoteVideoElement.height;
		  console.log("size changed ============> " + width + "," + height);
		  
		  eventType = "WindowSize";
		  var data = 
		  {
			'eventType': eventType,
			'width' : width,
			'height' : height
		  };
		  
		  var msg =
		  {
			'type' : 'remoteInput',
			'body' : data
		  }
		  streamingClient.sendInputChannelData(msg);
	   }
  }

  function trace(txt) {
    var elem = document.getElementById('debug');
    elem.innerHTML += txt + '<br>';
  }

  function connect() {
    var localName = document.getElementById('local').value.toLowerCase();
    var server = document.getElementById('server').value.toLowerCase();
    if (localName.length == 0) {
        alert('I need a name please.');
        document.getElementById('local').focus();
    } else {
        document.getElementById('connect').style.display = 'none';
        document.getElementById('cred').style.display = 'none';

        document.getElementById('disconnect').style.display = 'block';
        document.getElementById('disconnect').innerHTML = 'Connecting';
        document.getElementById('disconnect').disabled = true;

        document.getElementById('renderers').style.display = 'block';
        var list = document.getElementById('peerList');
        list.innerHTML = '';

        streamingClient = new ThreeDSTK.ThreeDStreamingClient({
          'serverUrl': server,
          'peerConnectionConfig': pcConfig
        }, {
          RTCPeerConnection: window.mozRTCPeerConnection || window.webkitRTCPeerConnection,
          RTCSessionDescription: window.mozRTCSessionDescription || window.RTCSessionDescription,
          RTCIceCandidate: window.mozRTCIceCandidate || window.RTCIceCandidate,
          getUserMedia: navigator.mozGetUserMedia || navigator.webkitGetUserMedia
        });

        streamingClient.signIn(localName, 
        {
          onaddstream: onRemoteStreamAdded.bind(this),
          onremovestream: onRemoteStreamRemoved,
          onopen: onSessionOpened,
          onclose: onSessionClosed,
          onconnecting: onSessionConnecting,
          onsignedin: onSignedIn.bind(this),
          onupdatepeers: updatePeerList.bind(this)
        })
          .then(streamingClient.startHeartbeat.bind(streamingClient))
          .then(streamingClient.pollSignalingServer.bind(streamingClient, true));
    }
  }

  function onSignedIn()
  {
    console.log("----------------- onSignedIn ----------------")
    document.getElementById('disconnect').innerHTML = 'Disconnect';
    document.getElementById('disconnect').disabled = false;
    //document.getElementById('disconnect').style.display = 'block';
  }

  function disconnect()
  {
    streamingClient.disconnect();
    if(remoteVideoElement !== null) {
      remoteVideoElement.src = null;
    }
    document.getElementById('connect').style.display = 'block';
    document.getElementById('cred').style.display = 'block';
    document.getElementById('disconnect').style.display = 'none';
    document.getElementById('renderers').style.display = 'none';
  }

  function updatePeerList() {
    try {
        var list = document.getElementById('peerList');

        list.innerHTML = '';

        for (var peerId in streamingClient.otherPeers) {
            var peer = streamingClient.otherPeers[peerId];

            var option = document.createElement('option');

            option.text = peer;
			option.peerId = peerId;
            list.add(option);
        }

    } catch (e) {
        trace('error ' + e.description);
        console.error(e.name + ': ' + e.message);
    }
  }

  window.onbeforeunload = disconnect;

  function onSessionConnecting(message) {
    console.log('Session connecting.');
  }

  function onSessionOpened(message) {
    console.log('Session opened.');
  }

  function onSessionClosed(message) {
    remoteVideoElement.stop();
    remoteVideoElement.src = null;
    console.log('Session closed.');
  }

  function onRemoteStreamRemoved(event) {
    remoteVideoElement.stop();
    remoteVideoElement.src = null;
    console.log('Remote stream removed.');
  }

  function onRemoteSdpError(event) {
    console.error('onRemoteSdpError', event.name, event.message);
  }

  function onRemoteSdpSucces() {
    console.log('onRemoteSdpSucces');
  }

  $('#connect').click(connect);
  $('#disconnect').click(disconnect);
  $('#join').click(joinPeer);


  $('#remote-video').mousedown(navMouseEventHandler);
  $('#remote-video').mouseup(navMouseEventHandler);
  //$('#remote-video').click(navOnMouseUp);
  $('#remote-video').mousemove(navMouseEventHandler);
  $('#remote-video').mouseenter(navMouseEventHandler);
  $('#remote-video').mouseleave(navMouseEventHandler);
  $('#remote-video').on("mousewheel DOMMouseScroll",navMouseEventHandler);
  document.oncontextmenu = function(){return false;}
});
