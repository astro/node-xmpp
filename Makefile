PATH := node_modules/.bin:$(PATH)

.PHONY: setup test clean bundle start stop restart size

setup:
	yarn
	lerna bootstrap
	make bundle

test:
	ava
	eslint .
	make restart
	ava --serial --fail-fast test/

clean:
	make stop
	rm -f prosody/prosody.err
	rm -f prosody/prosody.log
	rm -f prosody/prosody.pid
	lerna clean --yes
	rm -rf node_modules/
	rm -f packages/*/dist/*.js
	rm -f lerna-debug.log

bundle:
	lerna run bundle

start:
	./server/ctl start

stop:
	./server/ctl stop

restart:
	./server/ctl restart

size:
	browserify packages/client-core/index.js | babili | gzip > /tmp/bundle.js.gz ; stat -c%s /tmp/bundle.js.gz
