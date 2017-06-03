'use strict'

module.exports = function debug(entity) {
  if (process.env.XMPP_DEBUG) {
    entity.on('input', data => console.log('⮈', data))
    entity.on('output', data => console.log('⮊', data))
    entity.on('error', err => console.error('❌', err))
    entity.on('status', (status, value) => console.log('🛈', status, value ? value.toString() : ''))
  }
}
