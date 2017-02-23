'use strict'

/* eslint-disable camelcase */

;[
  'stream-features',
  'bind',
  'sasl',
  'sasl-plain',
  'sasl-scram-sha-1',
  'websocket',
  'tcp',
  'tls',
  'reconnect',
  'starttls',
  'session-establishment'
].forEach((pkg) => {
  module.exports[pkg] = require('@xmpp/plugins/' + pkg)
})
