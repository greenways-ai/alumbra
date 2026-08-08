const WHITESPACE = /[\s,]/;
const DELIMITER = /[\s,\[\]{}()";]/;
const MAX_DATA_DEPTH = 256;

export class EdnSyntaxError extends SyntaxError {
  constructor(message, source, index) {
    const before = source.slice(0, index);
    const line = before.split("\n").length;
    const column = index - before.lastIndexOf("\n");
    super(`${message} at ${line}:${column}`);
    this.name = "EdnSyntaxError";
    this.index = index;
    this.line = line;
    this.column = column;
  }
}

export function parseEdn(source, { dataOnly = false } = {}) {
  if (typeof source !== "string") throw new TypeError("EDN source must be a string");
  let index = 0;

  const fail = (message, at = index) => {
    throw new EdnSyntaxError(message, source, at);
  };

  const skipIgnored = () => {
    while (index < source.length) {
      const character = source[index];
      if (WHITESPACE.test(character)) {
        index += 1;
        continue;
      }
      if (character === ";") {
        while (index < source.length && source[index] !== "\n") index += 1;
        continue;
      }
      break;
    }
  };

  const readString = () => {
    const start = index;
    index += 1;
    let output = "";
    while (index < source.length) {
      const character = source[index++];
      if (character === '"') return output;
      if (character !== "\\") {
        output += character;
        continue;
      }
      if (index >= source.length) fail("Unterminated string escape", start);
      const escaped = source[index++];
      if (escaped === '"' || escaped === "\\" || escaped === "/") output += escaped;
      else if (escaped === "b") output += "\b";
      else if (escaped === "f") output += "\f";
      else if (escaped === "n") output += "\n";
      else if (escaped === "r") output += "\r";
      else if (escaped === "t") output += "\t";
      else if (escaped === "u") {
        const hex = source.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Invalid Unicode escape", index - 2);
        output += String.fromCodePoint(Number.parseInt(hex, 16));
        index += 4;
      } else {
        fail(`Unsupported string escape \\${escaped}`, index - 2);
      }
    }
    fail("Unterminated string", start);
  };

  const readToken = () => {
    const start = index;
    while (index < source.length && !DELIMITER.test(source[index])) index += 1;
    const token = source.slice(start, index);
    if (!token) fail("Expected EDN token", start);
    if (token === "nil") return null;
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^[+-]?(?:0|[1-9]\d*)$/.test(token)) {
      const number = Number(token);
      if (!Number.isSafeInteger(number)) fail(`EDN integer is outside the safe range: ${token}`, start);
      return number;
    }
    if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(token)
      || /^[+-]?\d+[eE][+-]?\d+$/.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number)) fail(`EDN number must be finite: ${token}`, start);
      return number;
    }
    if (dataOnly) fail(`EDN data transport does not allow keyword or symbol token: ${token}`, start);
    return token.startsWith(":") ? token.slice(1) : token;
  };

  const readCollection = (closing, kind) => {
    index += 1;
    const values = [];
    while (true) {
      skipIgnored();
      if (index >= source.length) fail(`Unterminated ${kind}`);
      if (source[index] === closing) {
        index += 1;
        return values;
      }
      values.push(readValue());
    }
  };

  const mapKey = (value, at) => {
    if (dataOnly) {
      if (typeof value === "string") return value;
      fail("EDN data transport map keys must be strings", at);
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    fail("EDN map keys must be scalar identifiers", at);
  };

  const readMap = () => {
    const start = index;
    const values = readCollection("}", "map");
    if (values.length % 2 !== 0) fail("EDN map requires an even number of forms", start);
    const output = {};
    for (let offset = 0; offset < values.length; offset += 2) {
      const key = mapKey(values[offset], start);
      if (Object.hasOwn(output, key)) fail(`Duplicate EDN map key: ${key}`, start);
      Object.defineProperty(output, key, {
        value: values[offset + 1],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  };

  const readSet = () => {
    const start = index;
    if (source[index] !== "#" || source[index + 1] !== "{") fail("Expected EDN set", start);
    if (dataOnly) fail("EDN data transport does not allow sets", start);
    index += 1;
    const values = readCollection("}", "set");
    const seen = new Set();
    for (const value of values) {
      const key = JSON.stringify(value);
      if (seen.has(key)) fail("Duplicate EDN set entry", start);
      seen.add(key);
    }
    return values;
  };

  const readValue = () => {
    skipIgnored();
    if (index >= source.length) fail("Expected EDN value");
    const character = source[index];
    if (character === '"') return readString();
    if (character === "{") return readMap();
    if (character === "[") return readCollection("]", "vector");
    if (character === "(") {
      if (dataOnly) fail("EDN data transport does not allow lists");
      return readCollection(")", "list");
    }
    if (character === "#") {
      if (source[index + 1] === "{") return readSet();
      fail("Unsupported EDN dispatch form");
    }
    if (character === "]" || character === "}" || character === ")") {
      fail(`Unexpected EDN delimiter: ${character}`);
    }
    return readToken();
  };

  const value = readValue();
  skipIgnored();
  if (index !== source.length) fail("Unexpected trailing EDN form");
  return value;
}

export function parseEdnData(source) {
  return parseEdn(source, { dataOnly: true });
}

export function writeEdnData(value) {
  const active = new Set();

  const encode = (entry, depth, path) => {
    if (depth > MAX_DATA_DEPTH) {
      throw new TypeError(`EDN data transport exceeds ${MAX_DATA_DEPTH} levels at ${path}`);
    }
    if (entry === null) return "nil";
    if (typeof entry === "boolean") return entry ? "true" : "false";
    if (typeof entry === "string") return JSON.stringify(entry);
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) throw new TypeError(`EDN data transport number must be finite at ${path}`);
      if (Number.isInteger(entry) && !Number.isSafeInteger(entry)) {
        throw new TypeError(`EDN data transport integer is outside the safe range at ${path}`);
      }
      return Object.is(entry, -0) ? "0" : String(entry);
    }
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`EDN data transport contains unsupported ${typeof entry} at ${path}`);
    }
    if (active.has(entry)) throw new TypeError(`EDN data transport contains a cycle at ${path}`);
    active.add(entry);
    try {
      if (Array.isArray(entry)) {
        return `[${entry.map((item, index) => encode(item, depth + 1, `${path}[${index}]`)).join(" ")}]`;
      }
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`EDN data transport requires plain objects at ${path}`);
      }
      const pairs = [];
      for (const key of Object.keys(entry).sort()) {
        pairs.push(`${JSON.stringify(key)} ${encode(entry[key], depth + 1, `${path}.${key}`)}`);
      }
      return `{${pairs.join(" ")}}`;
    } finally {
      active.delete(entry);
    }
  };

  return encode(value, 0, "$");
}
