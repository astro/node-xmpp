'use strict'

const Promise = require('bluebird')
const EventEmitter = require('events')
const xml = require('@xmpp/xml')

function trim (el) {
  el.children.forEach((child, idx) => {
    if (typeof child === 'string') el.children[idx] = child.trim()
    else trim(child)
  })
  return el
}

class Console extends EventEmitter {
  constructor (entity) {
    super()
    this.entity = entity

    // entity.on('nonza', el => {
    //   this.input(el)
    // })
    // entity.on('stanza', el => {
    //   this.input(el)
    // })
    //
    // entity.on('send', el => {
    //   this.output(el)
    // })

    entity.on('fragment', (input, output) => {
      if (!output) return
      this.output(output)
    })

    entity.on('element', (el) => {
      this.input(el)
    })

    entity.on('connect', () => {
      this.info('connected')
    })

    entity.on('open', () => {
      this.info('open')
    })

    entity.on('authenticated', () => {
      this.info('authenticated')
    })

    entity.on('online', (jid) => {
      this.jid = jid
      this.info(`online ${jid.toString()}`)
    })

    entity.on('error', (err) => {
      this.error(err)
    })

    entity.on('authenticate', auth => {
      this.info('authenticating')
    })

    const streamFeatures = entity.plugins['stream-features']
    if (streamFeatures) {
      streamFeatures.onStreamFeatures = (features, el) => {
        const options = {
          text: 'Choose stream feature',
          cancelText: 'Done',
          choices: features.map(({name}) => name)
        }
        this.choose(options).then((feature) => {
          return features.find((f) => f.name === feature).run()
        })
      }
    }

    const sasl = entity.plugins.sasl
    if (sasl) {
      entity.plugins['sasl'].getCredentials = () => {
        return this.askMultiple([
          {
            text: 'enter username'
          },
          {
            text: 'Enter password',
            type: 'password'
          }
        ])
      }
      entity.plugins['sasl'].getMechanism = (mechs) => {
        return this.choose({
          text: 'Choose SASL mechanism',
          choices: mechs
        })
      }
    }

    const register = entity.plugins.register
    if (register) {
      register.onFields = (fields, register) => {
        return this.ask({
          text: 'Choose username'
        })
        .then((username) => {
          return this.ask({
            text: 'Choose password',
            type: 'password'
          }).then(password => register(username, password))
        })
      }
    }

    const bind = entity.plugins.bind
    if (bind) {
      bind.getResource = () => {
        return this.ask({
          text: 'Enter resource or leave empty'
        })
      }
    }

    // component
    entity.on('authenticate', (auth) => {
      this.ask({
        text: 'Enter password'
      }).then(auth)
    })

    entity.on('connect', () => {
      this.ask({
        text: 'Enter domain',
        value: 'localhost'
      }).then((domain) => {
        entity.open({domain})
      })
    })
  }

  input (el) {
    this.log('⮈ IN', typeof el === 'string' ? el : this.beautify(el))
  }

  output (el) {
    this.log('⮊ OUT', typeof el === 'string' ? el : this.beautify(el))
  }

  beautify (el) {
    return xml.stringify(trim(el), '  ').trim()
  }

  askMultiple (options) {
    return Promise.mapSeries(options, o => this.ask(o))
  }

  parse (str) {
    try {
      return xml.parse(str)
    } catch (err) {
      return str
    }
  }

  send (data) {
    let el
    try {
      el = xml.parse(data)
    } catch (err) {
      this.error(`invalid XML "${data}"`, err)
      return
    }

    if (this.jid && !this.jid.local && !el.attrs.to) {
      const domain = this.entity._domain
      el.attrs.to = domain.substr(domain.indexOf('.') + 1) // FIXME in component-core
    }
    this.entity.send(el).then(() => {
      this.resetInput()
    })
  }

  resetInput () {
  }

  log (...args) {
    console.log(...args)
  }

  info (...args) {
    this.log('🛈 ', ...args)
  }

  warning (...args) {
    this.log('⚠ ', ...args)
  }

  error (...args) {
    this.log('❌ error\n', ...args)
  }
}

module.exports = Console
