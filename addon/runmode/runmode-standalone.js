// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE

var root = typeof globalThis !== 'undefined' ? globalThis : window;
root.CodeMirror = {};

(function() {
"use strict";

function splitLines(string){ return string.split(/\r\n?|\n/); };

function copyObj(obj, target, overwrite) {
  if (!target) target = {}
  for (let prop in obj)
    if (obj.hasOwnProperty(prop) && (overwrite !== false || !target.hasOwnProperty(prop)))
      target[prop] = obj[prop]
  return target
}

function nothing() {}

function createObj(base, props) {
  let inst
  if (Object.create) {
    inst = Object.create(base)
  } else {
    nothing.prototype = base
    inst = new nothing()
  }
  if (props) copyObj(props, inst)
  return inst
}

function StringStream(string, _tabSize, oracle) {
  this.pos = this.start = 0;
  this.string = string
  this.oracle = oracle
}
StringStream.prototype = {
  eol: function() {return this.pos >= this.string.length;},
  sol: function() {return this.pos == 0;},
  peek: function() {return this.string.charAt(this.pos) || null;},
  next: function() {
    if (this.pos < this.string.length)
      return this.string.charAt(this.pos++);
  },
  eat: function(match) {
    var ch = this.string.charAt(this.pos);
    if (typeof match == "string") var ok = ch == match;
    else var ok = ch && (match.test ? match.test(ch) : match(ch));
    if (ok) {++this.pos; return ch;}
  },
  eatWhile: function(match) {
    var start = this.pos;
    while (this.eat(match)){}
    return this.pos > start;
  },
  eatSpace: function() {
    var start = this.pos;
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
    return this.pos > start;
  },
  skipToEnd: function() {this.pos = this.string.length;},
  skipTo: function(ch) {
    var found = this.string.indexOf(ch, this.pos);
    if (found > -1) {this.pos = found; return true;}
  },
  backUp: function(n) {this.pos -= n;},
  column: function() {return this.start - this.lineStart;},
  indentation: function() {return 0;},
  match: function(pattern, consume, caseInsensitive) {
    if (typeof pattern == "string") {
      var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
      var substr = this.string.substr(this.pos, pattern.length);
      if (cased(substr) == cased(pattern)) {
        if (consume !== false) this.pos += pattern.length;
        return true;
      }
    } else {
      var match = this.string.slice(this.pos).match(pattern);
      if (match && match.index > 0) return null;
      if (match && consume !== false) this.pos += match[0].length;
      return match;
    }
  },
  current: function(){return this.string.slice(this.start, this.pos);},
  hideFirstChars: function(n, inner) {
    this.lineStart += n;
    try { return inner(); }
    finally { this.lineStart -= n; }
  },
  lookAhead: function(n) { return this.oracle && this.oracle.lookAhead(n) }
};
CodeMirror.StringStream = StringStream;

CodeMirror.startState = function (mode, a1, a2) {
  return mode.startState ? mode.startState(a1, a2) : true;
};

var modes = CodeMirror.modes = {}, mimeModes = CodeMirror.mimeModes = {};
CodeMirror.defineMode = function (name, mode) {
  if (arguments.length > 2)
    mode.dependencies = Array.prototype.slice.call(arguments, 2);
  modes[name] = mode;
};
CodeMirror.defineMIME = function (mime, spec) { mimeModes[mime] = spec; };

CodeMirror.defineMode("null", function() {
  return {token: function(stream) {stream.skipToEnd();}};
});
CodeMirror.defineMIME("text/plain", "null");

// Given a MIME type, a {name, ...options} config object, or a name
// string, return a mode config object.
CodeMirror.resolveMode = function(spec) {
  if (typeof spec == "string" && mimeModes.hasOwnProperty(spec)) {
    spec = mimeModes[spec]
  } else if (spec && typeof spec.name == "string" && mimeModes.hasOwnProperty(spec.name)) {
    let found = mimeModes[spec.name]
    if (typeof found == "string") found = {name: found}
    spec = createObj(found, spec)
    spec.name = found.name
  } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
    return CodeMirror.resolveMode("application/xml")
  } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+json$/.test(spec)) {
    return CodeMirror.resolveMode("application/json")
  }
  if (typeof spec == "string") return {name: spec}
  else return spec || {name: "null"}
}

// Given a mode spec (anything that resolveMode accepts), find and
// initialize an actual mode object.
CodeMirror.getMode = function (options, spec) {
  spec = CodeMirror.resolveMode(spec)
  let mfactory = modes[spec.name]
  if (!mfactory) return CodeMirror.getMode(options, "text/plain")
  let modeObj = mfactory(options, spec)
  if (modeExtensions.hasOwnProperty(spec.name)) {
    let exts = modeExtensions[spec.name]
    for (let prop in exts) {
      if (!exts.hasOwnProperty(prop)) continue
      if (modeObj.hasOwnProperty(prop)) modeObj["_" + prop] = modeObj[prop]
      modeObj[prop] = exts[prop]
    }
  }
  modeObj.name = spec.name
  if (spec.helperType) modeObj.helperType = spec.helperType
  if (spec.modeProps) for (let prop in spec.modeProps)
    modeObj[prop] = spec.modeProps[prop]

  return modeObj
};

// This can be used to attach properties to mode objects from
// outside the actual mode definition.
var modeExtensions = CodeMirror.modeExtensions = {};
CodeMirror.extendMode = function(mode, properties) {
  var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
  copyObj(properties, exts);
};

// Given a mode and a state (for that mode), find the inner mode and
// state at the position that the state refers to.
CodeMirror.innerMode = function(mode, state) {
  let info
  while (mode.innerMode) {
    info = mode.innerMode(state)
    if (!info || info.mode == mode) break
    state = info.state
    mode = info.mode
  }
  return info || {mode: mode, state: state}
};

CodeMirror.registerHelper = CodeMirror.registerGlobalHelper = Math.min;

CodeMirror.runMode = function (string, modespec, callback, options) {
  var mode = CodeMirror.getMode({ indentUnit: 2 }, modespec);
  var ie = /MSIE \d/.test(navigator.userAgent);
  var ie_lt9 = ie && (document.documentMode == null || document.documentMode < 9);

  if (callback.appendChild) {
    var tabSize = (options && options.tabSize) || 4;
    var node = callback, col = 0;
    node.innerHTML = "";
    callback = function (text, style) {
      if (text == "\n") {
        // Emitting LF or CRLF on IE8 or earlier results in an incorrect display.
        // Emitting a carriage return makes everything ok.
        node.appendChild(document.createTextNode(ie_lt9 ? '\r' : text));
        col = 0;
        return;
      }
      var content = "";
      // replace tabs
      for (var pos = 0; ;) {
        var idx = text.indexOf("\t", pos);
        if (idx == -1) {
          content += text.slice(pos);
          col += text.length - pos;
          break;
        } else {
          col += idx - pos;
          content += text.slice(pos, idx);
          var size = tabSize - col % tabSize;
          col += size;
          for (var i = 0; i < size; ++i) content += " ";
          pos = idx + 1;
        }
      }

      if (style) {
        var sp = node.appendChild(document.createElement("span"));
        sp.className = "cm-" + style.replace(/ +/g, " cm-");
        sp.appendChild(document.createTextNode(content));
      } else {
        node.appendChild(document.createTextNode(content));
      }
    };
  }

  var lines = splitLines(string), state = (options && options.state) || CodeMirror.startState(mode);
  var oracle = {lookAhead: function(n) { return lines[i + n] }}
  for (var i = 0, e = lines.length; i < e; ++i) {
    if (i) callback("\n");
    var stream = new CodeMirror.StringStream(lines[i], tabSize, oracle);
    if (!stream.string && mode.blankLine) mode.blankLine(state);
    while (!stream.eol()) {
      var style = mode.token(stream, state);
      callback(stream.current(), style, i, stream.start, state);
      stream.start = stream.pos;
    }
  }
};
})();
