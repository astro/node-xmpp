'use strict'

/* eslint-disable no-console */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const {xml, client} = require('./index') // For you; require('@xmpp/client')
const entity = client()

// Emitted for any error
entity.on('error', err => {
  console.error('error', err)
})

// Let's log status changes
entity.listen('status', status => {
  console.log('🛈', status)
})

// Emitted for incoming stanza _only_ (iq/presence/message) qualified with the right namespace
// entity.on('stanza', (stanza) => {
//   console.log('stanza', stanza.toString())
// })

// Emitted for incoming nonza _only_
// entity.on('nonza', (nonza) => {
//   console.log('nonza', nonza.toString())
// })

// useful for logging raw traffic
// Emitted for every incoming fragment
entity.listen('input', data => console.log('⮈', data))
// Emitted for every outgoing fragment
entity.listen('output', data => console.log('⮊', data))

// Emitted for any in our out XML root element
// useful for logging
// entity.on('element', (input, output) => {
//   console.log(output ? 'element =>' : 'element <=', (output || input).toString())
// })

// entity.on('online', jid => {
//   console.log('jid', jid.toString())
//   entity.send(xml`<presence/>`)
// })
entity.listen('online', jid => {
  console.log('jid', jid.toString())
  entity.send(xml`<presence/>`)
})

// "start" opens the socket and the XML stream
entity.start('localhost') // Auto
// entity.start('xmpp://localhost:5222') // TCP
// entity.start('xmpps://localhost:5223') // TLS
// entity.start('ws://localhost:5280/xmpp-websocket') // Websocket
// entity.start('wss://localhost:5281/xmpp-websocket') // Secure WebSocket
  .catch(err => {
    console.error('start failed', err)
  })

// Emitted when authentication is required
entity.listen('authenticate', authenticate => {
  authenticate('node-xmpp', 'foobar').catch(err => console.error('authentication failed', err))
})

process.on('unhandledRejection', (reason, p) => {
  console.log('Possibly Unhandled Rejection at: Promise ', p, ' reason: ', reason)
})
