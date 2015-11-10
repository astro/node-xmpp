/* global describe, it */

'use strict'

var assert = require('assert')
var Stanza = require('..').Stanza

describe('Stanza', function () {
  describe('createStanza', function () {
    it('creates a new stanza and set children', function () {
      var c = new Stanza('bar')
      var e = Stanza.createStanza('foo', {'foo': 'bar'}, 'foo', c)
      assert(e instanceof Stanza)
      assert(e.is('foo'))
      assert.equal(e.attrs.foo, 'bar')
      assert.equal(e.children.length, 2)
      assert.equal(e.children[0], 'foo')
      assert.equal(e.children[1], c)
    })
  })

  describe('create', function () {
    describe('IQ', function () {
      it('should return an iq stanza', function () {
        var s = new Stanza('iq')
        assert(s instanceof Stanza)
        assert(s.is('iq'))
      })
    })

    describe('message', function () {
      it('should return a message stanza', function () {
        var s = new Stanza('message')
        assert(s instanceof Stanza)
        assert(s.is('message'))
      })
    })

    describe('presence', function () {
      it('should return a presence stanza', function () {
        var s = new Stanza('presence')
        assert(s instanceof Stanza)
        assert(s.is('presence'))
      })
    })
  })

  describe('common attributes as properties', function () {
    var s = new Stanza('iq')

    describe('from', function () {
      it('should set "from" attribute', function () {
        s.from = 'l@d'
        assert.equal(s.attrs.from, 'l@d')
      })

      it('should get "from" attribute', function () {
        s.attrs.from = 'd@l'
        assert.equal(s.from, 'd@l')
      })
    })

    describe('to', function () {
      it('should set "to" attribute', function () {
        s.to = 'l@d'
        assert.equal(s.attrs.to, 'l@d')
      })

      it('should get "to" attribute', function () {
        s.attrs.to = 'd@l'
        assert.equal(s.to, 'd@l')
      })
    })

    describe('id', function () {
      it('should set "id" attribute', function () {
        s.id = 'i'
        assert.equal(s.attrs.id, 'i')
      })

      it('should get "id" attribute', function () {
        s.attrs.id = 'd'
        assert.equal(s.id, 'd')
      })
    })

    describe('type', function () {
      it('should set "type" attribute', function () {
        s.type = 'error'
        assert.equal(s.attrs.type, 'error')
      })

      it('should get "type" attribute', function () {
        s.attrs.type = 'result'
        assert.equal(s.type, 'result')
      })
    })
  })

  describe('clone', function () {
    var originalStanza = new Stanza('iq')
      .c('foo', { xmlns: 'bar' })
      .up()
      .c('bar', { xmlns: 'foo' })
      .root()

    it('clones the stanza', function () {
      var cloned = originalStanza.clone()
      assert.equal(originalStanza.toString(), cloned.toString())
    })

    it('returns a Stanza instance', function () {
      var cloned = originalStanza.clone()
      assert(cloned instanceof Stanza)
    })

    it("doesn't modify clone if original is modified", function () {
      var cloned = originalStanza.clone()
      originalStanza.attr('foo', 'bar')
      assert.equal(cloned.attr('foo'), undefined)
      originalStanza.c('foobar')
      assert.equal(cloned.getChild('foobar'), undefined)
    })
  })
})
