var BPClient = {};

BPClient.helperReady = false;
BPClient.versionExtension = "";
BPClient.versionHost = "";
BPClient.versionPlugin = "";
BPClient.localIpAddress = "";
BPClient.localHostname = "";
BPClient.playbackServerPort = 0;
BPClient.popupSupported = false;
BPClient.homeDir = "";
BPClient.eventHandlers = {};
BPClient.nextReqId = 1;
BPClient.destroyReqId = 0;
BPClient.plugin = null;
BPClient.createInstanceReqId = "";
BPClient.instanceId = "";
BPClient.destroyingInstanceId = "";
BPClient.debug = false;
BPClient.useExtension = false;
BPClient.phoneType = "phone_type_none";
BPClient.pluginType = "webrtc";
BPClient.supportsWebrtc = false;
BPClient.supportsUnsecure = false;
BPClient.supportsSecure = false;

//	Descriptions of defined alerts
BPClient.alerts = {
	make_call_device_not_found_error: { code: 1001, text: "Unsuccessful call attempt: microphone/speakers/headphones not found" },
	make_call_security_error:         { code: 1002, text: "Unsuccessful call attempt: page not secure/access to device has been denied/etc" },
	make_call_other_error:            { code: 1003, text: "Unsuccessful call attempt: unknown error" },
    no_microphone_detected_error:     { code: 1004, text: "No microphone detected, calls are not possible" }
};

//	This script can call this function to send alert update to the browser page
function setAlert(isOn, alert)
{
    alert = BPClient.alerts[alert];

    if (isOn)
        console.log('setAlert: ' + alert.code + ' - ' + alert.text);

    if (alert.on == undefined)
        alert.on = false;

    var func = BPClient.eventHandlers["set_alert"];
	if (func != undefined)
    {
        if (isOn && !alert.on)
        {
		    func(true, alert.code, alert.text, true);
            alert.on = true;
        }
        else if (!isOn && alert.on)
        {
		    func(false, alert.code, alert.text, true);
            alert.on = false;
        }
    }
}

// 	browser detect
//	https://gist.github.com/2107/5529665
var BrowserDetect = {
        init: function() {
		this.browser = this.searchString(this.dataBrowser) || "An unknown browser";
		this.version = this.searchVersion(navigator.userAgent) || this.searchVersion(navigator.appVersion) || "an unknown version";
		this.OS = this.searchString(this.dataOS) || "an unknown OS";
	},
	searchString: function(data) {
		for (var i = 0; i < data.length; i++) {
			var dataString = data[i].string;
			var dataProp = data[i].prop;
			this.versionSearchString = data[i].versionSearch || data[i].identity;
			if (dataString) {
				if (dataString.indexOf(data[i].subString) != -1) return data[i].identity;
			} else if (dataProp) return data[i].identity;
		}
	},
	searchVersion: function(dataString) {
		var index = dataString.indexOf(this.versionSearchString);
		if (index == -1) return;
		return parseFloat(dataString.substring(index + this.versionSearchString.length + 1));
	},
	dataBrowser: [{
		string: navigator.userAgent,
		subString: "Chrome",
		identity: "Chrome"
	}, {
		string: navigator.userAgent,
		subString: "OmniWeb",
		versionSearch: "OmniWeb/",
		identity: "OmniWeb"
	}, {
		string: navigator.vendor,
		subString: "Apple",
		identity: "Safari",
		versionSearch: "Version"
	}, {
		prop: window.opera,
		identity: "Opera",
		versionSearch: "Version"
	}, {
		string: navigator.vendor,
		subString: "iCab",
		identity: "iCab"
	}, {
		string: navigator.vendor,
		subString: "KDE",
		identity: "Konqueror"
	}, {
		string: navigator.userAgent,
		subString: "Firefox",
		identity: "Firefox"
	}, {
		string: navigator.vendor,
		subString: "Camino",
		identity: "Camino"
	}, { // for newer Netscapes (6+)
		string: navigator.userAgent,
		subString: "Netscape",
		identity: "Netscape"
	}, {
		string: navigator.userAgent,
		subString: "MSIE",
		identity: "Explorer",
		versionSearch: "MSIE"
	}, {
		string: navigator.userAgent,
		subString: "Trident/",
		identity: "Explorer",
		versionSearch: "rv"
	}, {
		string: navigator.userAgent,
		subString: "Gecko",
		identity: "Mozilla",
		versionSearch: "rv"
	}, { // for older Netscapes (4-)
		string: navigator.userAgent,
		subString: "Mozilla",
		identity: "Netscape",
		versionSearch: "Mozilla"
	}],
	dataOS: [{
		string: navigator.platform,
		subString: "Win",
		identity: "Windows"
	}, {
		string: navigator.platform,
		subString: "Mac",
		identity: "Mac"
	}, {
		string: navigator.userAgent,
		subString: "iPhone",
		identity: "iPhone/iPod"
	}, {
		string: navigator.platform,
		subString: "Linux",
		identity: "Linux"
	}]

};

BrowserDetect.init();

BPClient.OS = BrowserDetect.OS;
BPClient.browser = BrowserDetect.browser;
BPClient.browserVersion = BrowserDetect.version;

BPClient.supportsWebrtc = webrtc_supported();

function log(msg) {
	if (undefined != console)
		console.log(msg);
}

function getUuid() {
	var d = new Date().getTime();
	d += (parseInt(Math.random() * 100)).toString();
	d = 'uid-' + d;
	return d;
}

//	Private functions
BPClient.addEventHandler = function(_event, _f) {
	this.eventHandlers[_event] = _f;
	
	if (("helper_up" == _event && this.helperReady) || ("helper_down" == _event && !this.helperReady)) {
		_f();
	}
}

BPClient.sendMessageToHost = function(_req) {
	try
	{
		//	Do not send instance related requests if we do not have instance ID
		if (this.instanceId == "" && 
			( 	"log" != _req.action && 
				"open_log_file" != _req.action && 
				"open_log_folder" != _req.action && 
				"terminate" != _req.action && 
				"create_instance" != _req.action &&
				"reset_port" != _req.action
			))
		{
			log("Instance is not created or has been destroyed, request " + _req.action + " will not be sent to the AD Helper");
			return 0;
		}
		
		if (undefined == _req.req_id || "" == _req.req_id)
			_req.req_id = "" + this.nextReqId++;
			
		_req.instance_id = this.instanceId;
		
		if (this.useExtension) {
			var msg = {};
			msg["type"] = "PAGE_TO_BPCLIENT";
			msg["msg"] = _req;

            window.postMessage(msg, "*");
		}
		else if (null != this.plugin) {
			this.plugin.sendMessageToHost(JSON.stringify(_req));
		}
		else {
			log("Browser extension or plugin not initialized; unable to communicate");
			return 0;
		}
		
		if ("__pong__" != _req.action && this.debug)
			log("Sent to AD Helper: " + JSON.stringify(_req));
			
		return _req.req_id;
	}
	catch(e)
	{
		log("Exception: " + e.message);
	}
	
	return 0;
}

//	Public API
BPClient.initHelper = function() {
	log("Detected OS: " + this.OS + ", browser: " + this.browser + ", browser version: " + this.browserVersion);

    //	Chrone, FF and Safari 10+ uses web extension
	if ("Chrome" == this.browser || "Firefox" == this.browser || ("Safari" == this.browser && this.browserVersion >= 10)) {
	if (this.checkExtension()) {
			log(this.browser + " web extension found, version " + this.versionExtension);
		this.useExtension = true;
		this.sendMessageToHost({action: "reset_port"});
			
			return true;
	}
	else {
			log(this.browser + " web extension not found, it is required!!!");
			return false;
		}
	}
	else {
		log("Will use the plugin for " + this.browser);
		this.useExtension = false;
		
		return this.createPlugin();
	}
	
	return false;
}

BPClient.checkExtension = function() {
	if ("Chrome" == this.browser || "Firefox" == this.browser || ("Safari" == this.browser && this.browserVersion >= 10)) {
		var div = document.getElementById('iCSIMExtensionInstalled');
		if (div == null) {
			return false;
		}
	
		this.versionExtension = div.getAttribute("ext_version");
		
		if ("Chrome" == this.browser) {
			if(document.getElementById("iInstallChromeExtension")) {
				document.getElementById("iInstallChromeExtension").style.display = 'none';
			}
		}		
		
		return true;
	}
	else {
		return false;
	}
}

BPClient.terminate = function() {
	this.sendMessageToHost({action: "terminate"});
}

BPClient.createPlugin = function() {
	if (null != this.plugin)
		return true;

	var div = document.getElementById("pluginObject");
	if (div == null)
	{
		div = document.createElement("div");
		div.id = "pluginObject";
		document.body.appendChild(div);
	}
			
	if (null != div)
	{
		if ("Explorer" == this.browser) {
			var embedded = "<object type=\"application/x-bpclient\" classid=\"clsid:2A7D37AC-1C03-4F05-8A34-9FF043AB9EFC\" tabindex=\"-1\" height=\"0\" width=\"0\" id=\"bpclient\" name=\"bpclient\" " +
						"#version=1,0,0,1\"><span>Plugin not loaded.</span></object>";

			div.innerHTML = embedded;
		}
		else {
			var plugin = document.createElement("object");

			plugin.id = "bpclient";
			plugin.setAttribute("type", "application/x-bpclient");
			plugin.setAttribute("width", "0");
			plugin.setAttribute("height", "0");
			plugin.setAttribute("tabindex", "-1");

			div.appendChild(plugin);
		}
	}
	
	this.plugin = document.getElementById("bpclient");
	
	this.versionPlugin = this.plugin.version;

	if ("Explorer" == this.browser && this.browserVersion >= 11) {
		this.plugin["onmessage_from_host"] = this.onMessageFromHost;
	}
	else if ("Explorer" == this.browser) {
		this.plugin.attachEvent("onmessage_from_host", this.onMessageFromHost, false);
	}
	else {
		this.plugin.addEventListener("message_from_host", this.onMessageFromHost, false);
	}
	
	return undefined != this.versionPlugin;
}

BPClient.create = function(disableAutologoutPrevention) {
	if ("" != this.instanceId) {
		log("BPClient object instance already created, intercepting request");
		return;
	}
	
	this.createInstanceReqId = getUuid();

	this.sendMessageToHost({action: "create_instance", req_id: this.createInstanceReqId, disable_autologout_prevention: disableAutologoutPrevention});
}

BPClient.destroy = function() {
	this.destroyingInstanceId = this.instanceId;
	
	var req = {};
	req.action = "destroy_instance";
	
	this.sendMessageToHost(req);
	BPClient.destroyReqId = req.req_id;
	this.instanceId = "";
}

BPClient.setPhoneType = function(_type) {
	console.log('setPhoneType: ' + _type);

    if (this.phoneType == 'phone_type_browser') {
        if (this.supportsWebrtc)
            webrtc_terminate();
    }

	this.phoneType = _type;

    if (this.phoneType == 'phone_type_browser') {
        if (this.supportsWebrtc)
            webrtc_init();
    }
    else if (this.helperReady && (this.phoneType == 'phone_type_soft_unsecure' || this.phoneType == 'phone_type_soft_secure'))
        this.updatePhoneStatus(0, plugin_in_device, plugin_out_device);
}

BPClient.init = function(_cfg) {
	this.sendMessageToHost({action: "init", cfg: _cfg});
}

BPClient.pluginMessageReceived = function(_userId, _jsonMsg) {
	this.sendMessageToHost({action: "plugin_message_received", user_id: _userId, json_msg: _jsonMsg});
}

BPClient.log = function(_level, _msg) {
	this.sendMessageToHost({action: "log", message: _msg});
}

BPClient.openLogFile = function() {
	this.sendMessageToHost({action: "open_log_file"});
}

BPClient.openLogFolder = function() {
	this.sendMessageToHost({action: "open_log_folder"});
}

BPClient.startEndpoint = function(_cfg) {
	if ("phone_type_soft_unsecure" == this.phoneType && !this.supportsSecure)
	this.sendMessageToHost({action: "start_endpoint", cfg: _cfg});
}

BPClient.stopEndpoint = function(_unregister, _dropMode) {
	if ("phone_type_soft_unsecure" == this.phoneType && !this.supportsSecure)
	this.sendMessageToHost({action: "stop_endpoint", unregister: _unregister ? 1 : 0, drop_mode: undefined != _dropMode ? _dropMode : 2});
}

BPClient.makeRtcCall = function(_requestId, _number, _sdp) {
	if ("phone_type_browser" == this.phoneType)
		webrtc_iframe.contentWindow.webrtc_call_make(_requestId, _number, _sdp);
	else if ("phone_type_soft_secure" == this.phoneType || ("phone_type_soft_unsecure" == this.phoneType && this.supportsSecure))
	this.sendMessageToHost({action: "rtc_call_make", request_id: _requestId, number: _number, sdp: _sdp});
}

BPClient.dropRtcCall = function(_requestId, _number) {
	if ("phone_type_browser" == this.phoneType)
		webrtc_iframe.contentWindow.webrtc_call_drop(_requestId, _number);
	else if ("phone_type_soft_secure" == this.phoneType || ("phone_type_soft_unsecure" == this.phoneType && this.supportsSecure))
	this.sendMessageToHost({action: "rtc_call_drop", request_id: _requestId, number: _number});
}

BPClient.showInboundCallPopup = function(_callId, _line1, _line2, _line3, _line4,
                _showScreenButton, _labelAnswer, _labelHangup, _labelScreen, 
                _title, _parentTitle, _media) {
	var req = {};
	req.action = "show_inbound_call_popup";
	req.call_id = _callId;
	req.line_1 = _line1;
	req.line_2 = _line2;
	req.line_3 = _line3;
	req.line_4 = _line4;
	req.show_screen_button = _showScreenButton ? 1 : 0;
	req.label_answer = _labelAnswer;
	req.label_hangup = _labelHangup;
	req.label_screen = _labelScreen;
	req.title = _title;
	req.parent_title = _parentTitle;
	req.media = _media;
	
	this.sendMessageToHost(req);

	return req.req_id;
}

BPClient.showInboundCallPopupV2 = function(_callId, _lines, _showScreenButton, _labelAnswer, _labelHangup, _labelScreen, _title, _parentTitle, _media, _source, _photoUrl, segment) {
	var req = {};
	req.action = "show_inbound_call_popup_v2";
	req.call_id = _callId;
	req.lines = _lines;
	req.show_screen_button = _showScreenButton ? 1 : 0;
	req.label_answer = _labelAnswer;
	req.label_hangup = _labelHangup;
	req.label_screen = _labelScreen;
	req.title = _title;
	req.parent_title = _parentTitle;
	req.media = _media;
	req.source = _source;
	req.photoUrl = _photoUrl;
	req.segment = segment;
	
	this.sendMessageToHost(req);

	return req.req_id;
}

BPClient.updateInboundCallPopupLine = function(_callId, _line, _text) {
	this.sendMessageToHost({action: "update_inbound_call_popup_line", call_id: _callId, line: _line, text: _text});
}

BPClient.updateInboundCallPopupButton = function(_callId, _button, _label, _show) {
	this.sendMessageToHost({action: "update_inbound_call_popup_button", call_id: _callId, button: _button, label: _label, show: _show ? 1 : 0});
}

BPClient.updateInboundCallPopupSource = function(_callId, _source) {
	this.sendMessageToHost({action: "update_inbound_call_popup_source", call_id: _callId, source: _source});
}

BPClient.updateInboundCallPopupSegment = function(_callId, _segment) {
	this.sendMessageToHost({action: "update_inbound_call_popup_segment", call_id: _callId, segment: _segment});
}

BPClient.updateInboundCallPopupPhoto = function(_callId, _url) {
	this.sendMessageToHost({action: "update_inbound_call_popup_photo", call_id: _callId, url: _url});
}

BPClient.cancelInboundCallPopup = function(_callId) {
	this.sendMessageToHost({action: "cancel_inbound_call_popup", call_id: _callId});
}

BPClient.vncInit = function(_IPAddress, _monitorsSet, _bitrate, _grayscale) {
	this.sendMessageToHost({action: "vnc_init", ip_address: _IPAddress, record_subset: _monitorsSet, bitrate: _bitrate, grayscale: _grayscale});
}

BPClient.vncViewUserScreenOld = function(_userId, _relayAddr, _relayPort) {
	var req = {};
	req.action = "vnc_view_user_screen";
	req.user_id = _userId;
	req.proxy_addr = _relayAddr;
	req.proxy_port = _relayPort;

	this.sendMessageToHost(req);

	return req.req_id;
}

BPClient.vncViewUserScreen = function(_userId, _relayAddr, _relayPort) {
	var url = "http://127.0.0.1:" + this.playbackServerPort + "/view_screen" + 
		"?instance_id=" + this.instanceId +
		"&user_id=" + _userId +
		"&host=" + _relayAddr + 
		"&port=" + _relayPort;

	window.open(url);
}


BPClient.vncViewSessions = function() {
	this.sendMessageToHost({action: "vnc_view_sessions"});
}

BPClient.vncStartRecording = function(_addr, _port, _file) {
	var req = {};
	req.action = "vnc_start_recording";
	req.host = _addr;
	req.port = _port;
	req.file = _file;

	this.sendMessageToHost(req);

	return req.req_id;
}

BPClient.vncMuteRecording = function(_sessionId) {
	this.sendMessageToHost({action: "vnc_mute_recording", session_id: _sessionId});
}

BPClient.vncUnmuteRecording = function(_sessionId) {
	this.sendMessageToHost({action: "vnc_unmute_recording", session_id: _sessionId});
}

BPClient.vncStopRecording = function(_sessionId) {
	this.sendMessageToHost({action: "vnc_stop_recording", session_id: _sessionId});
}

BPClient.vncRecordingSessions = function() {
	this.sendMessageToHost({action: "vnc_recording_sessions"});
}

BPClient.startCallWaitingSound = function(_url, _audioId, _version, _periodicity, _type) {
    if (this.phoneType == "phone_type_browser")
        webrtc_iframe.contentWindow.noplugin_sound_start(_url, _audioId, _version, _periodicity, _type);
    else if (BPClient.helperReady)
	this.sendMessageToHost({action: "start_call_waiting_sound", url: _url, audio_id: _audioId, version: _version, periodicity: _periodicity, type: _type});
}

BPClient.stopCallWaitingSound = function() {
    if (this.phoneType == "phone_type_browser") 
        webrtc_iframe.contentWindow.noplugin_sound_stop();

    if (BPClient.helperReady)
	    this.sendMessageToHost({action: "stop_call_waiting_sound"});
}

BPClient.setVolume = function(_cfg) {
    if (this.phoneType == "phone_type_browser" && webrtc_iframe.contentWindow.noplugin_set_volume != undefined) 
        webrtc_iframe.contentWindow.noplugin_set_volume(_cfg);
    
    if (BPClient.helperReady)
	this.sendMessageToHost({action: "set_volume", cfg: _cfg});
}

BPClient.sendMessageToApi = function(_json) {
	this.sendMessageToHost({action: "send_message_to_api", json: _json});
}

var plugin_in_device = '', plugin_out_device = '';

BPClient.processMessageFromHost = function(_msg) {
	if ("__ping__" != _msg.action && this.debug)
		log("Received from AD Helper: " + JSON.stringify(_msg));

	var func = this.eventHandlers[_msg.action];

	switch (_msg.action)  {
		case "helper_up":
			this.helperReady = true;
			if (func != undefined)
				func();
			break;
		case "helper_down":
			this.helperReady = false;
			this.instanceId = "";
			this.versionHost = "";
			
			if (func != undefined)
				func();

            if (this.phoneType == 'phone_type_soft_unsecure' || this.phoneType == 'phone_type_soft_secure')
                this.updatePhoneStatus(0, '', '');
			break;
		case "instance_created":
			if ("" != this.instanceId || _msg.req_id != this.createInstanceReqId)
				return;
			
			this.createInstanceReqId = "";
			this.instanceId = _msg.instance_id;
			this.versionHost = _msg.version;
			this.localIpAddress = _msg.local_ip;
			this.localHostname = _msg.local_hostname;
			this.popupSupported = _msg.popup_supported;
			this.homeDir = _msg.home_dir;

			var rc = "SIP";
			
			//this.supportsWebrtc = webrtc_supported();
			this.supportsUnsecure = true;

	                var firstWebRtcVersion = "5.3.99";
	                if (undefined == _msg.version || (webrtc_version_is_less(firstWebRtcVersion, _msg.version) && _msg.version != "1.0.0.1")) {
				this.pluginType = "sip";
			} else {
				this.supportsSecure = true;
				this.pluginType = "webrtc";
			}

			if (func != undefined)
				func();
			break;
		case "instance_destroyed":
			if (_msg.instance_id != this.destroyingInstanceId)
				return;
				
			this.instanceId = "";
			this.destroyingInstanceId = "";
			
			if (func != undefined)
				func();
			
			break;
		case "__ping__":
			if (_msg.instance_id != this.instanceId)
				return;

			var msg = {};
			msg.action = "__pong__";
			msg.instance_id = this.instanceId;
			this.sendMessageToHost(msg);

			return;
		case "inactivity_detected":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func();
			break;
		case "inactivity_cleared":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func();
			break;
		case "plugin_send_message":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.user_id, _msg.json_msg);
			break;
		case "phone_status":
            if (_msg.instance_id == this.instanceId && func != undefined && (this.phoneType == 'phone_type_soft_unsecure' || this.phoneType == 'phone_type_soft_secure'))
				this.updatePhoneStatus(_msg.code, _msg.in_device, _msg.out_device);
            plugin_in_device = _msg.in_device;
            plugin_out_device = _msg.out_device;
			break;
		case "endpoint_status":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.number, _msg.code, _msg.error);
			break;
		case "popup_created":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.req_id, _msg.call_id);
			break;
		case "popup_closed":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.call_id, _msg.command);
			break;
		case "vnc_init_status":
			this.playbackServerPort = _msg.playback_server_port;
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.req_id, _msg.session_id);
			break;
		case "vnc_view_session_created":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.req_id, _msg.session_id);
			break;
		case "vnc_view_session_status":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.session_id, _msg.status);
			break;
		case "vnc_view_session_completed":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.session_id, _msg.reason);
			break;
		case "vnc_view_sessions":
			if (_msg.instance_id == this.instanceId && func != undefined) {
				//	Transform KVList to array of session IDs
				var arrIds = [];
				for (var i in _msg.sessions) {
					arrIds[i] = _msg.sessions[i];
				}
				
				func(arrIds);
			}
			break;
		case "vnc_recording_session_created":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.req_id, _msg.session_id);
			break;
		case "vnc_recording_session_muted":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.session_id);
			break;
		case "vnc_recording_session_unmuted":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.session_id);
			break;
		case "vnc_recording_session_completed":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.session_id, _msg.reason);
			break;
		case "vnc_recording_sessions":
			if (_msg.instance_id == this.instanceId && func != undefined) {
				//	Transform KVList to array of session IDs
				var arrIds = [];
				for (var i in _msg.sessions) {
					arrIds[i] = _msg.sessions[i];
				}
				
				func(arrIds);
			}
			break;
		case "api_message_received":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.msg);
			break;
		case "rtc_call_made":
			if (_msg.instance_id == this.instanceId && func != undefined)
				func(_msg.request_id, _msg.number, _msg.status, _msg.sdp);
			break;
		case "error":
			if (BPClient.destroyReqId != 0 && _msg.req_id == BPClient.destroyReqId)
			{
				var f = this.eventHandlers["instance_destroyed"];
				this.instanceId = "";
				this.destroyingInstanceId = "";
				
				if (f != undefined)
					f();
			}
			else if ((_msg.instance_id == this.instanceId || undefined   == _msg.instanceId) && func != undefined)
				func(_msg.error_code, _msg.error_text, _msg.req_id);
			break;
	}
}

BPClient.onMessageFromHost = function(_msg) {
	BPClient.processMessageFromHost(JSON.parse(_msg));
}

BPClient.updatePhoneStatus = function(code, in_device, out_device) {
    console.log('updatePhoneStatus: ' + code + ' ' + in_device + ' ' + out_device);

    setAlert(in_device == '', 'no_microphone_detected_error');

    var func = BPClient.eventHandlers["phone_status"];
	if (func != undefined)
		func(code, in_device, out_device);
}

if ("Chrome" == BPClient.browser || "Firefox" == BPClient.browser || ("Safari" == BPClient.browser && BPClient.browserVersion >= 10)) {
	window.addEventListener("message", function(event) {
		// We only accept messages from extension
		if (event.source != window)
			return;

		if (event.data.type && (event.data.type == "BPCLIENT_TO_PAGE")) {
			BPClient.processMessageFromHost(event.data.msg);
		}
	}, false);
}

function webrtc_supported()
{
	if ("Chrome" != BPClient.browser && "Firefox" != BPClient.browser && "Safari" != BPClient.browser)
    {
        console.log("webrtc_supported: unsupported browser");
		return false;
    }
	
	if (!window.isSecureContext)	//	Not supported on IE, but we filtered IE out anyway...
    {
        console.log("webrtc_supported: not secure");
		return false;
    }
	
	if (!window.RTCPeerConnection)
    {
        console.log("webrtc_supported: RTCPeerConnection not supported");
        return false;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !navigator.mediaDevices.enumerateDevices) {
        console.log("webrtc_supported: mediaDevices not supported");
	    return false;
    }

    console.log("webrtc_supported: true");

    return true;
}

var webrtc_iframe = false;
var webrtc_device_change_timer_id = false;

function webrtc_init()
{
    if (!webrtc_iframe) {
        webrtc_iframe = document.createElement("iframe");
        webrtc_iframe.style.border = 0;
        webrtc_iframe.style.width = "1px";
        webrtc_iframe.style.height = "1px";
        webrtc_iframe.setAttribute('allow', 'microphone');
        document.body.appendChild(webrtc_iframe);

        webrtc_iframe.addEventListener("load", function() {
            console.log('webrtc_iframe loaded');
            if (BPClient.phoneType == 'phone_type_browser')
                webrtc_iframe.contentWindow.webrtc_init();
        });
    }

    webrtc_iframe.src = "webrtc.jsp";

    if (BPClient.browser == "Chrome" || BPClient.browser == "Firefox")
    {
        navigator.mediaDevices.ondevicechange = function () {
            if (webrtc_device_change_timer_id)
                clearTimeout(webrtc_device_change_timer_id);

            webrtc_device_change_timer_id = setTimeout(function () {
                webrtc_device_change_timer_id = false;
                console.log('reloading webrtc_iframe');
                webrtc_iframe.contentWindow.location.reload();
            }, 100);
        }
    }
    
    return true;
}

function webrtc_terminate()
{
    webrtc_iframe.src = 'about:blank';

    if (webrtc_device_change_timer_id) {
        clearTimeout(webrtc_device_change_timer_id);
        webrtc_device_change_timer_id = false;
    }

    navigator.mediaDevices.ondevicechange = null;
}

function webrtc_update_phone_status(code, in_device, out_device)
{
    BPClient.updatePhoneStatus(code, in_device, out_device);
}

function webrtc_call_made(request_id, number, status, sdp)
{
	var func = BPClient.eventHandlers["rtc_call_made"];
	if (func != undefined)
		func(request_id, number, status, sdp);
}

function webrtc_init_failed()
{
    var func = BPClient.eventHandlers["webrtc_init_failed"];
    if (func != undefined)
        func();
}

function webrtc_version_is_less(v1, v2) {
    var v1Arr = v1.split(".");
    var v2Arr = v2.split(".");
    var k = Math.min(v1.length, v2.length);
    for (var i = 0; i < k; i++) {
	var n1 = parseInt(v1);
	var n2 = parseInt(v2);
	if (n2 > n1) 
	    return false;
	if (n2 < n1) 
	    return true;
    }
    
    return (v1.length == v2.length) ? false : (v1.length > v2.length);
}
