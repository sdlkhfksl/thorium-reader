// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

// Strict RFC 4122
// UUIDv4 validation would require "4" as the first nibble of the 3rd group
// and one of "8", "9", "a", or "b" as the first nibble of the 4th group.
// const UUID_V4_FORMAT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const UUID_V4_CANONICAL_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_V4_FORMAT_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidv4 = (): string => {
    return globalThis.crypto.randomUUID()
};

export const isUUIDv4 = (uuid: string | undefined) => UUID_V4_CANONICAL_REGEX.test(uuid);

export const canonicalizeUUIDv4 = (uuid: string | undefined): string | undefined => {
    if (!UUID_V4_FORMAT_REGEX.test(uuid)) {
        return undefined;
    }
    return uuid.toLowerCase();
};

export const assertUUIDv4 = (uuid: string | undefined) => {
    if (!isUUIDv4(uuid)) {
        throw new Error("not an uuidv4 identifier !");
    }
};
