#!/bin/sh

# https://www.npmjs.com/package/npm-scripts-lifecycle
# https://app.unpkg.com/npm-scripts-lifecycle@1.0.0/files/package.json

## TODO remove the local `npm run postinstall` once this is fixed:
# https://github.com/TypeStrong/ts-loader/issues/1678
# (remember to do the main.yaml GitHub Actions Workflow definition too, see `npm ci`)

npm cache clear --force
rm -rf node_modules/ && rm -f package-lock.json && npm install --ignore-scripts --foreground-scripts && npm run postinstall && npm run build:prod

# npm install --foreground-scripts
# TODO: preinstall, install and postinstall NPM lifecycle hooks for Electron, fsevents, ParcelWatcher, etc.?

cd node_modules/electron && npm run postinstall && cd -
#cd node_modules/fsevents && npm run postinstall && cd -
