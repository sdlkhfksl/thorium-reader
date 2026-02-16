// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import debug_ from "debug";
import { SagaGenerator, select as selectTyped, call as callTyped, delay as delayTyped } from "typed-redux-saga/macro";
import { RootState } from "../../states";
import { diMainGet } from "readium-desktop/main/di";
import * as fs from "node:fs";
import * as path from "node:path";
import { publicationExtensionStoredOnDisk } from "readium-desktop/common/extension";
import { _APP_NAME, _APP_VERSION, _PACK_NAME } from "readium-desktop/preprocessor-directives";
import { USER_DATA_FOLDER } from "readium-desktop/common/constant";

// TODO: use app.getPath("logs"); instead
const folderPath = path.join(
    USER_DATA_FOLDER,
    "app-logs",
);
const PROCESS_LOGS = "publicationsIntegrityChecker.txt";
const appLogs = path.join(
    folderPath,
    PROCESS_LOGS,
);

if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
}
const processInfoStr = JSON.stringify({
    node_version: process.version,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    uptime_seconds: process.uptime(),
    memory_usage: process.memoryUsage(),
    argv: process.argv,
    MSWindowsStore: process.windowsStore,
    thoriumAppName: _APP_NAME,
    thoriumAppVersion: _APP_VERSION,
    thoriumPackName: _PACK_NAME,
    thoriumUserDataPath: USER_DATA_FOLDER,
}, null, 4);

// Logger
const filename_ = "readium-desktop:main:redux:sagas:publication:checker";
const debug__ = debug_(filename_);

export function* publicationIntegrityChecker(): SagaGenerator<void> {

    let dump = "#############################################\n";
    dump += `Date: ${(new Date()).toISOString()}\n`;
    const debug = (str: string) => {
        debug__(str);
        dump += str + "\n";
    };

    const pubs = yield* selectTyped((state: RootState) => state.publication.db);
    const publicationDirectoryPath = yield* callTyped(() => diMainGet("publication-storage").getRootPath());

    const pubsDict = Object.entries(pubs);
    const [publicationIdentifiersDataBase, publicationDocuments] = [pubsDict.map(([id]) => id), pubsDict.map(([_, doc]) => doc)];

    const files = yield* callTyped(() => fs.promises.readdir(publicationDirectoryPath, {withFileTypes: true}));
    const FileNameNotCorrectArray: fs.Dirent[] = [];
    const directoryFileCorrectArray: Array<{ rootDir: fs.Dirent, identifiedFileArray: fs.Dirent[], unknownFileArray: fs.Dirent[] }> = [];
    const publicationIdentifiersFileSystem: string[] = [];
    for (const file of files) {
        if (
            /\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/.test(file.name) &&
            file.isDirectory() &&
            publicationIdentifiersDataBase.includes(file.name)
        ) {
            publicationIdentifiersFileSystem.push(file.name);

            const filePath = path.join(file.parentPath, file.name);
            const publicationDirectoryFiles = yield* callTyped(() => fs.promises.readdir(filePath, { withFileTypes: true }));

            // if (publicationDirectoryFiles.length !== 3) {
            //     debug(`uuid directory: ${file.name} does not have 3 files but ${publicationDirectoryFiles.length} files`);
            // }

            const publicationFileNameReference = [
                {base: "book", ext: publicationExtensionStoredOnDisk},
                {base: "cover", ext: undefined},
                {base: "manifest", ext: [".json"]},
            ];
            const identifiedFileArray: fs.Dirent[] = [];
            const unknownFileArray: fs.Dirent[] = [];
            for (const pubFile of publicationDirectoryFiles) {
                const ext = path.extname(pubFile.name);
                const base = path.basename(pubFile.name, ext);
                if (publicationFileNameReference.find(({base: _base, ext: _ext}) => {
                    return base === _base && (!_ext || _ext.includes(ext));
                })) {
                    identifiedFileArray.push(pubFile);
                } else {
                    unknownFileArray.push(pubFile);
                }
            }

            directoryFileCorrectArray.push({rootDir: file, identifiedFileArray, unknownFileArray});
        } else {
            FileNameNotCorrectArray.push(file);
        }

    }
    yield* delayTyped(1);
    const publicationDocumentIdArray = publicationDocuments.map(({identifier}) => identifier);
    const publicationDocumentNotFoundArray: string[] = publicationDocumentIdArray.filter((id) => !publicationIdentifiersFileSystem.includes(id));
    const publicationDocumentFoundArray = publicationDocumentIdArray.filter((id) => publicationIdentifiersFileSystem.includes(id));

    debug("==> uuid publication directory not correct because not a directory, uuid or not found in database and need to be removed:");
    for (const file of FileNameNotCorrectArray) {
        debug(`Directory: ${file.isDirectory()}, File: ${file.isFile()}, Filename: ${file.name}`);
    }
    debug("--------");

    debug("==> publication identifier not found in publication directory:");
    for (const id of publicationDocumentNotFoundArray) {
        debug(`pubId: ${id}`);
    }
    debug("--------");

    debug(`${directoryFileCorrectArray.length} uuid directory(ies) found on disk and ${publicationDocumentIdArray.length} publication(s) found in database`);
    debug(`${publicationDocumentNotFoundArray.length} publication(s) found in database but not found on the disk`);
    debug(`${publicationDocumentFoundArray.length} publication(s) matched between the database and the disk`);

    debug("==> files in publication uuid directory not identified and not correct:");
    const filesInpublicationUUIDDirectoryNotCorrect = directoryFileCorrectArray.filter((obj) => !!obj.unknownFileArray.length || !obj.identifiedFileArray.find((f) => f.name.startsWith("book.")));
    for (const obj of filesInpublicationUUIDDirectoryNotCorrect) {
        debug(`From ${obj.rootDir.name} =>`);
        for (const a of obj.unknownFileArray) {
            debug(`\tfileName: ${a.name}`);
        }
        debug(`whereas the identified files are (${obj.identifiedFileArray.length}):`);
        for (const a of obj.identifiedFileArray) {
            debug(`\tfileName: ${a.name}`);
        }
    }
    debug(`seems to have ${directoryFileCorrectArray.length - filesInpublicationUUIDDirectoryNotCorrect.length} publication(s) correct and identified in publication directory`);
    debug("--------");

    dump += `Process: ${processInfoStr}\n`;
    fs.appendFileSync(appLogs, dump);
}
