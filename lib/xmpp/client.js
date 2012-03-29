var EventEmitter = require('events').EventEmitter;
var Connection = require('./connection');
var BOSH = require('./bosh');
var WebSockets = require('./websockets');
var JID = require('./jid').JID;
var ltx = require('ltx');
var sasl = require('./sasl');
var util = require('util');
try {
    var SRV = require('./srv');
} catch (e) { }

var NS_CLIENT = 'jabber:client';
var NS_REGISTER = 'jabber:iq:register';
var NS_XMPP_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl';
var NS_XMPP_BIND = 'urn:ietf:params:xml:ns:xmpp-bind';
var NS_XMPP_SESSION = 'urn:ietf:params:xml:ns:xmpp-session';

var STATE_PREAUTH = 0,
    STATE_AUTH = 1,
    STATE_AUTHED = 2,
    STATE_BIND = 3,
    STATE_SESSION = 4,
    STATE_ONLINE = 5;
var IQID_SESSION = 'sess',
    IQID_BIND = 'bind';

/**
 * params object:
 *   jid: String (required)
 *   password: String (required)
 *   host: String (optional)
 *   port: Number (optional)
 *   reconnect: Boolean (optional)
 *   register: Boolean (option) - register account before authentication
 *
 * Example:
 *   var cl = new xmpp.Client({
 *       jid: "me@example.com",
 *       password: "secret"
 *   });
 *   var aceboo = new xmpp.Client({
 *       jid: '-' + fbUID + '@chat.facebook.com', 
 *       api_key: '54321', // api key of your facebook app
 *       access_token: 'abcdefg', // user access token
 *       host: 'chat.facebook.com',
 *   });
 */
function Client(params) {
    var self = this;
    EventEmitter.call(this);

    if (typeof params.jid == 'string')
        this.jid = new JID(params.jid);
    else
        this.jid = params.jid;
    this.password = params.password;
    this.preferredSaslMechanism = params.preferredSaslMechanism;
    this.availableSaslMechanisms = [];
    this.api_key = params.api_key;
    this.access_token = params.access_token;
    this.register = params.register;
    this.state = STATE_PREAUTH;
    delete this.did_bind;
    delete this.did_session;

    if (params.websocketsURL) {
	this.connection = new WebSockets.WSConnection(params.websocketsURL);
	this.connection.on('connected', function() {
	    if (self.connection.startStream)
		self.connection.startStream();
	});
    } else if (params.boshURL) {
	this.connection = new BOSH.BOSHConnection({
	    jid: this.jid,
	    boshURL: params.boshURL
	});
    } else {
	this.connection = new Connection.Connection({
	    xmlns: { '': NS_CLIENT },
	    streamAttrs: {
		version: "1.0",
		to: this.jid.domain
	    }
	});
	var connect = function() {
	    self.state = STATE_PREAUTH;
	    delete self.did_bind;
	    delete self.did_session;

	    if (params.host) {
		self.connection.socket.connect(params.port || 5222, params.host);
		self.connection.on('connect', function() {
		    if (self.connection.startStream)
			self.connection.startStream();
		});
	    } else if (!SRV) {
		throw "Cannot load SRV";
	    } else {
		var attempt = SRV.connect(self.connection.socket,
		    ['_xmpp-client._tcp'], self.jid.domain, 5222);
		attempt.addListener('connect', function() {
		    if (self.connection.startStream)
			self.connection.startStream();
		});
		attempt.addListener('error', function(e) {
		    self.emit('error', e);
		});
	    }
	};
	if (params.reconnect)
	    self.reconnect = connect;
	connect();
    }
    this.connection.addListener('stanza', this.onStanza.bind(this));
    this.connection.addListener('drain', this.emit.bind(this, 'drain'));

    this.connection.addListener('end', function() {
        self.state = STATE_PREAUTH;
        self.emit('offline');
        self.emit('end');
    });
    this.connection.addListener('close', function() {
        self.state = STATE_PREAUTH;
        self.emit('close');
    });
}

util.inherits(Client, EventEmitter);
exports.Client = Client;

Client.prototype.pause = function() {
    if (this.connection.pause)
	this.connection.pause();
};

Client.prototype.resume = function() {
    if (this.connection.resume)
	this.connection.resume();
};

Client.prototype.send = function(stanza) {
    this.connection.send(stanza);
};

Client.prototype.end = function() {
    this.connection.end();
};

Client.prototype.onStanza = function(stanza) {
    /* Actually, we shouldn't wait for <stream:features/> if
       this.streamAttrs.version is missing, but who uses pre-XMPP-1.0
       these days anyway? */
    if (this.state != STATE_ONLINE &&
        stanza.is('features', Connection.NS_STREAM)) {
        this.streamFeatures = stanza;
        this.useFeatures();
    } else if (this.state == STATE_AUTH) {
        if (stanza.is('challenge', NS_XMPP_SASL)) {
            var challengeMsg = decode64(stanza.getText());
            var responseMsg = encode64(this.mech.challenge(challengeMsg));
            this.send(new ltx.Element('response',
                                      { xmlns: NS_XMPP_SASL
                                      }).t(responseMsg));
        } else if (stanza.is('success', NS_XMPP_SASL)) {
            this.mech = null;
            this.state = STATE_AUTHED;
	    if (this.connection.startParser)
		this.connection.startParser();
	    if (this.connection.startStream)
		this.connection.startStream();
        } else {
            this.emit('error', 'XMPP authentication failure');
        }
    } else if (this.state == STATE_BIND &&
               stanza.is('iq') &&
               stanza.attrs.id == IQID_BIND) {
        if (stanza.attrs.type == 'result') {
            this.state = STATE_AUTHED;
            this.did_bind = true;

            var bindEl = stanza.getChild('bind', NS_XMPP_BIND);
            if (bindEl && bindEl.getChild('jid')) {
                this.jid = new JID(bindEl.getChild('jid').getText());
            }

            /* no stream restart, but next feature */
            this.useFeatures();
        } else {
            this.emit('error', 'Cannot bind resource');
        }
    } else if (this.state == STATE_SESSION &&
               stanza.is('iq') &&
               stanza.attrs.id == IQID_SESSION) {
        if (stanza.attrs.type == 'result') {
            this.state = STATE_AUTHED;
            this.did_session = true;

            /* no stream restart, but next feature (most probably
               we'll go online next) */
            this.useFeatures();
        } else {
            this.emit('error', 'Cannot bind resource');
        }
    } else if (stanza.name == 'stream:error') {
        this.emit('error', stanza);
    } else if (this.state == STATE_ONLINE) {
        this.emit('stanza', stanza);
    }
};

/**
 * Either we just received <stream:features/>, or we just enabled a
 * feature and are looking for the next.
 */
Client.prototype.useFeatures = function() {
    if (this.state == STATE_PREAUTH &&
        this.register) {
	delete this.register;
	this.doRegister();
    } else if (this.state == STATE_PREAUTH &&
        this.streamFeatures.getChild('mechanisms', NS_XMPP_SASL)) {
        this.state = STATE_AUTH;
	var offeredMechs = this.streamFeatures.
            getChild('mechanisms', NS_XMPP_SASL).
            getChildren('mechanism', NS_XMPP_SASL).
            map(function(el) { return el.getText(); });
        this.mech = sasl.selectMechanism(
            offeredMechs,
            this.preferredSaslMechanism,
            this.availableSaslMechanisms);
        if (this.mech) {
            this.mech.authzid = this.jid.bare().toString();
            this.mech.authcid = this.jid.user;
            this.mech.password = this.password;
            this.mech.api_key = this.api_key;
            this.mech.access_token = this.access_token;
            this.mech.realm = this.jid.domain;  // anything?
            this.mech.digest_uri = "xmpp/" + this.jid.domain;
            var authMsg = encode64(this.mech.auth());
            this.send(new ltx.Element('auth',
                                      { xmlns: NS_XMPP_SASL,
                                        mechanism: this.mech.name
                                      }).t(authMsg));
        } else {
            this.emit('error', 'No usable SASL mechanism');
        }
    } else if (this.state == STATE_AUTHED &&
               !this.did_bind &&
               this.streamFeatures.getChild('bind', NS_XMPP_BIND)) {
        this.state = STATE_BIND;
        var bindEl = new ltx.Element('iq',
                                     { type: 'set',
                                       id: IQID_BIND
                                     }).c('bind',
                                          { xmlns: NS_XMPP_BIND
                                          });
        if (this.jid.resource)
            bindEl.c('resource').t(this.jid.resource);
        this.send(bindEl);
    } else if (this.state == STATE_AUTHED &&
               !this.did_session &&
               this.streamFeatures.getChild('session', NS_XMPP_SESSION)) {
        this.state = STATE_SESSION;
        this.send(new ltx.Element('iq',
                                  { type: 'set',
                                    to: this.jid.domain,
                                    id: IQID_SESSION
                                  }).c('session',
                                       { xmlns: NS_XMPP_SESSION
                                       }));
    } else if (this.state == STATE_AUTHED) {
        /* Ok, we're authenticated and all features have been
           processed */
        this.state = STATE_ONLINE;
        this.emit('online');
    }
};

Client.prototype.doRegister = function() {
    var id = "register" + Math.ceil(Math.random() * 99999);
    var iq = new ltx.Element('iq', { type: 'set',
				     id: id,
				     to: this.jid.domain
				   }).
	c('query', { xmlns: NS_REGISTER }).
	c('username').t(this.jid.user).up().
	c('password').t(this.password);
    this.send(iq);

    var that = this;
    var onReply = function(reply) {
	if (reply.is('iq') && reply.attrs.id === id) {
	    that.removeListener('stanza', onReply);

	    if (reply.attrs.type === 'result') {
		/* Registration successful, proceed to auth */
		that.useFeatures();
	    } else {
		that.emit('error', new Error("Registration error"));
	    }
	}
    };
    this.on('stanza', onReply);
};

Client.prototype.registerSaslMechanism = function () {
    var args = arguments.length > 0 ? Array.prototype.slice.call(arguments) : [];
    this.availableSaslMechanisms = this.availableSaslMechanisms.concat(args);
};

var decode64, encode64, Buffer;
if (typeof btoa === 'function') {
    decode64 = function(encoded) {
	return atob(encoded);
    };
} else {
    Buffer = require('buffer').Buffer;
    decode64 = function(encoded) {
	return (new Buffer(encoded, 'base64')).toString('utf8');
    };
}
if (typeof atob === 'function') {
    encode64 = function(decoded) {
	console.log("encode64", decoded, btoa(decoded));
	return btoa(decoded);
    };
} else {
    Buffer = require('buffer').Buffer;
    encode64 = function(decoded) {
	return (new Buffer(decoded, 'utf8')).toString('base64');
    };
}
