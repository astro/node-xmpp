'use strict'

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , core = require('../xmpp').core
  , ltx = core.ltx
  , StreamParser = core.StreamParser
  , Connection = core.Connection
  , WebSocket = require('faye-websocket') && require('faye-websocket').Client ?
      require('faye-websocket').Client : window.WebSocket // eslint-disable-line
  , debug = require('debug')('xmpp:client:WebSocket')

function WebSocketConnection(opts) {
    EventEmitter.call(this)

    this.url = opts.websocket.url
    this.jid = opts.jid
    this.xmlns = {}
    this.websocket = new WebSocket(this.url, ['xmpp'])
    this.websocket.onopen = this.onopen.bind(this)
    this.websocket.onmessage = this.onmessage.bind(this)
    this.websocket.onclose = this.onclose.bind(this)
    this.websocket.onerror = this.onerror.bind(this)
}

util.inherits(WebSocketConnection, EventEmitter)

WebSocketConnection.prototype.maxStanzaSize = 65535
WebSocketConnection.prototype.xmppVersion = '1.0'

WebSocketConnection.prototype.onopen = function() {
    this.startParser()
    this.emit('connected')
}

WebSocketConnection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('start', function(attrs) {
        self.streamAttrs = attrs
        /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if ((k === 'xmlns') ||
                (k.substr(0, 6) === 'xmlns:')) {
                self.streamNsAttrs[k] = attrs[k]
            }
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        //self.onStanza(self.addStreamNs(stanza))
        self.onStanza(stanza)
    })
    this.parser.on('error', this.onerror.bind(this))
    this.parser.on('end', function() {
        self.stopParser()
        self.end()
    })
}

WebSocketConnection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        /* Get GC'ed */
        delete this.parser
    }
}

WebSocketConnection.prototype.onmessage = function(msg) {
    debug('input', msg.data)
    if (msg && msg.data && this.parser)
        this.parser.write(msg.data)
}

WebSocketConnection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', Connection.NS_STREAM)) {
        /* TODO: extract error text */
        this.emit('error', stanza)
    } else {
        this.emit('stanza', stanza)
    }
}

WebSocketConnection.prototype.startStream = function() {
    var attrs = {}
    for(var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k) {
                attrs.xmlns = this.xmlns[k]
            } else {
                attrs['xmlns:' + k] = this.xmlns[k]
            }
        }
    }
    if (this.xmppVersion)
        attrs.version = this.xmppVersion
    if (this.streamTo)
        attrs.to = this.streamTo
    if (this.streamId)
        attrs.id = this.streamId
    if (this.jid)
        attrs.to = this.jid.domain
    attrs.xmlns = 'jabber:client'
    attrs['xmlns:stream'] = Connection.NS_STREAM

    var el = new ltx.Element('stream:stream', attrs)
    // make it non-empty to cut the closing tag
    el.t(' ')
    var s = el.toString()
    this.send(s.substr(0, s.indexOf(' </stream:stream>')))

    this.streamOpened = true
}

WebSocketConnection.prototype.send = function(stanza) {
    if (stanza.root) stanza = stanza.root()
    stanza = stanza.toString()
    debug('output', stanza)
    this.websocket.send(stanza)
}

WebSocketConnection.prototype.onclose = function() {
    this.emit('disconnect')
    this.emit('close')
}

WebSocketConnection.prototype.end = function() {
    this.send('</stream:stream>')
    this.emit('disconnect')
    this.emit('end')
    if (this.websocket)
        this.websocket.close()
}

WebSocketConnection.prototype.onerror = function(e) {
    this.emit('error', e)
}

module.exports = WebSocketConnection
