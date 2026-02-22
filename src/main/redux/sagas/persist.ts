// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import debug_ from "debug";
import * as fs from "fs";
import { diMainGet, patchFilePath, readerConfigPath, stateFilePath } from "readium-desktop/main/di";
import { PersistRootState, RootState } from "readium-desktop/main/redux/states";
// eslint-disable-next-line local-rules/typed-redux-saga-use-typed-effects
import { call, debounce, all } from "redux-saga/effects";
import { flush as flushTyped, select as selectTyped, call as callTyped } from "typed-redux-saga/macro";
import { winActions } from "../actions";

import { patchChannel } from "./patch";
import { takeSpawnLeading } from "readium-desktop/common/redux/sagas/takeSpawnLeading";
import { readerActions } from "readium-desktop/common/redux/actions";
import { EventPayload } from "readium-desktop/common/ipc/sync";
import { SenderType } from "readium-desktop/common/models/sync";
import * as path from "path";
import { takeSpawnEvery } from "readium-desktop/common/redux/sagas/takeSpawnEvery";

const DEBOUNCE_TIME = 3 * 60 * 1000; // 3 min

const locatorFileHandleMap: Map<string, fs.promises.FileHandle> = new Map();

// Logger
const filename_ = "readium-desktop:main:saga:persist";
const debug = debug_(filename_);
debug("_");

const persistStateToFs = async (nextState: RootState) => {

    // currently saved in one json file.
    // may be consuming a lot of I/O
    // rather need to save by chunck of data in many json file

    debug("start of persist reduxState in disk");

    const value: PersistRootState = {
        theme: nextState.theme,
        win: nextState.win,
        publication: nextState.publication,
        reader: nextState.reader,
        session: nextState.session,
        screenReader: nextState.screenReader,
        i18n: nextState.i18n,
        opds: nextState.opds,
        version: nextState.version,
        wizard: nextState.wizard,
        settings: nextState.settings,
        creator: nextState.creator,
        noteExport: nextState.noteExport,
        customization: {
            provision: [],
            lock: undefined,
            history: nextState.customization.history,
            activate: nextState.customization.activate,
            welcomeScreen: undefined,
            manifest: undefined,
        },
    };

    await fs.promises.writeFile(stateFilePath, JSON.stringify(value), {encoding: "utf8"});
    debug("end of persist reduxState in disk");
};

export function* needToPersistFinalState() {

    const nextState = yield* selectTyped((store: RootState) => store);
    yield call(() => persistStateToFs(nextState));
    yield call(() => needToPersistPatch());

    yield* callTyped(async () => {
        for (const fileHandle of locatorFileHandleMap.values()) {
            await fileHandle.close();
        }
    });
}

export function* needToPersistPatch() {

    try {

        const ops = yield* flushTyped(patchChannel);

        let data = "";
        let i = 0;
        while (i < ops.length) {
            data += JSON.stringify(ops[i]) + ",\n";
            ++i;
        }

        debug(data);
        if (data) {
            debug("start of patch persistence");
            yield call(() => fs.promises.appendFile(patchFilePath, data, { encoding: "utf8" }));
            debug("end of patch persistence");
        }


    } catch (e) {
        debug("ERROR to persist patch state in the filesystem", e);
    }

}

function* persistLocatorInReaderConfigDirectory(action: readerActions.setLocator.TAction) {
    const locator = action.payload;
    const sender = action.sender as EventPayload["sender"];

    if (sender.type !== SenderType.Renderer) {
        debug("sender is not renderer !!!");
        return ;
    } 

    const locatorSerialize = JSON.stringify(locator, null, 4);

    const reader = yield* selectTyped((state: RootState) => state.win.session.reader[sender.identifier]);
    const pubId = reader.publicationIdentifier;
    const locatorDirPath = path.join(readerConfigPath, pubId);
    const locatorFilePath = path.join(locatorDirPath, "locator.json");

    yield* callTyped(() => locatorFileHandleMap.get(pubId).writeFile(locatorSerialize, { encoding: "utf-8" }));
    yield* callTyped(() => locatorFileHandleMap.get(pubId).sync());
    debug("LOCATOR written to", locatorFilePath);

}

function* writeLocatorToPublicationStorageVault(locatorSerialize: string, identifier: string) {

    const publicationPath = yield* callTyped(() => diMainGet("publication-storage").findPublicationPath(identifier));
    const locatorFilePath = path.join(publicationPath, "locator.json");

    try {
        const data = yield* callTyped(() => fs.promises.readFile(locatorFilePath, { encoding: "utf-8" }));
        if (data === locatorSerialize) {
            debug("LOCATOR Storage same as LOCATOR Serialized, already persisted");
            return ;
        }
    } catch {
        // ignore
    }

    let loop = 3;
    while (loop) {
        try {
            yield* callTyped(() => fs.promises.writeFile(locatorFilePath, locatorSerialize, { mode: 0o600, encoding: "utf-8", flush: true }));
        } catch (e) {
            debug(e);
        }
        debug("LOCATOR written to", locatorFilePath);

        const data = yield* callTyped(() => fs.promises.readFile(locatorFilePath, { encoding: "utf-8" }));
        if (data !== locatorSerialize) {
            debug("ERROR: locator not written/verified to", locatorFilePath);
            --loop;
        } else {
            break;
        }
    }
    if (!loop) {
        debug("========================");
        debug("ERROR: LOCATOR NOT WRITTEN TO PUBLICATION VAULT !!! Tried 3 times");
        debug("========================");
    }
}

export function saga() {
    return all([
        debounce(
            DEBOUNCE_TIME,
            winActions.persistRequest.ID,
            needToPersistPatch,
        ),
        takeSpawnLeading(
            readerActions.setLocator.ID,
            persistLocatorInReaderConfigDirectory,
            (e) => debug(e),
        ),
        debounce(
            DEBOUNCE_TIME,
            readerActions.setLocator.ID,
            function* (action: readerActions.setLocator.TAction) {

                const locator = action.payload;
                const sender = action.sender as EventPayload["sender"];

                if (sender.type !== SenderType.Renderer) {
                    debug("sender is not renderer !!!");
                    return;
                }    
                const reader = yield* selectTyped((state: RootState) => state.win.session.reader[sender.identifier]);
                const pubId = reader.publicationIdentifier;

                const locatorSerialize = JSON.stringify(locator, null, 4);
                yield* callTyped(writeLocatorToPublicationStorageVault, locatorSerialize, pubId);
            },
        ),
        takeSpawnEvery(
            winActions.reader.openRequest.ID,
            function* (action: winActions.reader.openRequest.TAction) {
                const { publicationIdentifier: pubId } = action.payload;

                const locatorDirPath = path.join(readerConfigPath, pubId);
                const locatorFilePath = path.join(locatorDirPath, "locator.json");

                while (1) {
                    try {
                        if (!locatorFileHandleMap.has(pubId)) {
                            locatorFileHandleMap.set(pubId, yield* callTyped(() => fs.promises.open(locatorFilePath, "w+", 0o600)));
                            debug("locator file open and ready to be written: ", locatorFilePath);

                            debug("There are currently", locatorFileHandleMap.size, "open locator file(s)");
                            debug([...locatorFileHandleMap.keys()]);
                        }
                    } catch (e) {
                        debug(JSON.stringify(e, null, 4));
                        debug("Error to persist locator in reader config directory");
                        if (e.code === "ENOENT") {
                            try {
                                debug("create directory", locatorDirPath);
                                yield* callTyped(() => fs.promises.mkdir(locatorDirPath, { recursive: false, mode: 0o600 }));
                                continue;
                            } catch (e) {
                                debug(e);
                            }
                        }
                    }
                    break; // important
                }
            },
            // (e) => error(filename_ + ":createReaderWindow", e),
            (e) => debug(e),
        ),
        // takeSpawnEvery(
        //     winActions.reader.openSucess.ID,
        //     winOpen,
        //     (e) => error(filename_ + ":winOpen", e),
        // ),
        takeSpawnEvery(
            winActions.reader.closed.ID,
            function* (action: winActions.reader.closed.TAction) {
                const { identifier } = action.payload;

                const reader = yield* selectTyped((state: RootState) => state.win.session.reader[identifier]);
                const pubId = reader.publicationIdentifier;

                if (locatorFileHandleMap.has(pubId)) {
                    locatorFileHandleMap.get(pubId).close();
                    locatorFileHandleMap.delete(pubId);
                    debug("locator file closed and deleted for", pubId);
                }

                const locator = reader.reduxState.locator;
                const locatorSerialize = JSON.stringify(locator, null, 4);
                yield* callTyped(writeLocatorToPublicationStorageVault, locatorSerialize, pubId);

            },
            // (e) => error(filename_ + ":winClose", e),
            (e) => debug(e),
        ),
    ]);
}
