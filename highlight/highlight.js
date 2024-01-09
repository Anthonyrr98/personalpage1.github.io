/*!
  Highlight.js v11.9.0 (git: b7ec4bfafc)
  (c) 2006-2023 undefined and other contributors
  License: BSD-3-Clause
 */
var hljs = (function () {
  'use strict';

  /* eslint-disable no-multi-assign */

  function deepFreeze(obj) {
    if (obj instanceof Map) {
      obj.clear =
        obj.delete =
        obj.set =
          function () {
            throw new Error('map is read-only');
          };
    } else if (obj instanceof Set) {
      obj.add =
        obj.clear =
        obj.delete =
          function () {
            throw new Error('set is read-only');
          };
    }

    // Freeze self
    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach((name) => {
      const prop = obj[name];
      const type = typeof prop;

      // Freeze prop if it is an object or function and also not already frozen
      if ((type === 'object' || type === 'function') && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    });

    return obj;
  }

  /** @typedef {import('highlight.js').CallbackResponse} CallbackResponse */
  /** @typedef {import('highlight.js').CompiledMode} CompiledMode */
  /** @implements CallbackResponse */

  class Response {
    /**
     * @param {CompiledMode} mode
     */
    constructor(mode) {
      // eslint-disable-next-line no-undefined
      if (mode.data === undefined) mode.data = {};

      this.data = mode.data;
      this.isMatchIgnored = false;
    }

    ignoreMatch() {
      this.isMatchIgnored = true;
    }
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function escapeHTML(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * performs a shallow merge of multiple objects into one
   *
   * @template T
   * @param {T} original
   * @param {Record<string,any>[]} objects
   * @returns {T} a single new object
   */
  function inherit$1(original, ...objects) {
    /** @type Record<string,any> */
    const result = Object.create(null);

    for (const key in original) {
      result[key] = original[key];
    }
    objects.forEach(function(obj) {
      for (const key in obj) {
        result[key] = obj[key];
      }
    });
    return /** @type {T} */ (result);
  }

  /**
   * @typedef {object} Renderer
   * @property {(text: string) => void} addText
   * @property {(node: Node) => void} openNode
   * @property {(node: Node) => void} closeNode
   * @property {() => string} value
   */

  /** @typedef {{scope?: string, language?: string, sublanguage?: boolean}} Node */
  /** @typedef {{walk: (r: Renderer) => void}} Tree */
  /** */

  const SPAN_CLOSE = '</span>';

  /**
   * Determines if a node needs to be wrapped in <span>
   *
   * @param {Node} node */
  const emitsWrappingTags = (node) => {
    // rarely we can have a sublanguage where language is undefined
    // TODO: track down why
    return !!node.scope;
  };

  /**
   *
   * @param {string} name
   * @param {{prefix:string}} options
   */
  const scopeToCSSClass = (name, { prefix }) => {
    // sub-language
    if (name.startsWith("language:")) {
      return name.replace("language:", "language-");
    }
    // tiered scope: comment.line
    if (name.includes(".")) {
      const pieces = name.split(".");
      return [
        `${prefix}${pieces.shift()}`,
        ...(pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`))
      ].join(" ");
    }
    // simple scope
    return `${prefix}${name}`;
  };

  /** @type {Renderer} */
  class HTMLRenderer {
    /**
     * Creates a new HTMLRenderer
     *
     * @param {Tree} parseTree - the parse tree (must support `walk` API)
     * @param {{classPrefix: string}} options
     */
    constructor(parseTree, options) {
      this.buffer = "";
      this.classPrefix = options.classPrefix;
      parseTree.walk(this);
    }

    /**
     * Adds texts to the output stream
     *
     * @param {string} text */
    addText(text) {
      this.buffer += escapeHTML(text);
    }

    /**
     * Adds a node open to the output stream (if needed)
     *
     * @param {Node} node */
    openNode(node) {
      if (!emitsWrappingTags(node)) return;

      const className = scopeToCSSClass(node.scope,
        { prefix: this.classPrefix });
      this.span(className);
    }

    /**
     * Adds a node close to the output stream (if needed)
     *
     * @param {Node} node */
    closeNode(node) {
      if (!emitsWrappingTags(node)) return;

      this.buffer += SPAN_CLOSE;
    }

    /**
     * returns the accumulated buffer
    */
    value() {
      return this.buffer;
    }

    // helpers

    /**
     * Builds a span element
     *
     * @param {string} className */
    span(className) {
      this.buffer += `<span class="${className}">`;
    }
  }

  /** @typedef {{scope?: string, language?: string, children: Node[]} | string} Node */
  /** @typedef {{scope?: string, language?: string, children: Node[]} } DataNode */
  /** @typedef {import('highlight.js').Emitter} Emitter */
  /**  */

  /** @returns {DataNode} */
  const newNode = (opts = {}) => {
    /** @type DataNode */
    const result = { children: [] };
    Object.assign(result, opts);
    return result;
  };

  class TokenTree {
    constructor() {
      /** @type DataNode */
      this.rootNode = newNode();
      this.stack = [this.rootNode];
    }

    get top() {
      return this.stack[this.stack.length - 1];
    }

    get root() { return this.rootNode; }

    /** @param {Node} node */
    add(node) {
      this.top.children.push(node);
    }

    /** @param {string} scope */
    openNode(scope) {
      /** @type Node */
      const node = newNode({ scope });
      this.add(node);
      this.stack.push(node);
    }

    closeNode() {
      if (this.stack.length > 1) {
        return this.stack.pop();
      }
      // eslint-disable-next-line no-undefined
      return undefined;
    }

    closeAllNodes() {
      while (this.closeNode());
    }

    toJSON() {
      return JSON.stringify(this.rootNode, null, 4);
    }

    /**
     * @typedef { import("./html_renderer").Renderer } Renderer
     * @param {Renderer} builder
     */
    walk(builder) {
      // this does not
      return this.constructor._walk(builder, this.rootNode);
      // this works
      // return TokenTree._walk(builder, this.rootNode);
    }

    /**
     * @param {Renderer} builder
     * @param {Node} node
     */
    static _walk(builder, node) {
      if (typeof node === "string") {
        builder.addText(node);
      } else if (node.children) {
        builder.openNode(node);
        node.children.forEach((child) => this._walk(builder, child));
        builder.closeNode(node);
      }
      return builder;
    }

    /**
     * @param {Node} node
     */
    static _collapse(node) {
      if (typeof node === "string") return;
      if (!node.children) return;

      if (node.children.every(el => typeof el === "string")) {
        // node.text = node.children.join("");
        // delete node.children;
        node.children = [node.children.join("")];
      } else {
        node.children.forEach((child) => {
          TokenTree._collapse(child);
        });
      }
    }
  }

  /**
    Currently this is all private API, but this is the minimal API necessary
    that an Emitter must implement to fully support the parser.

    Minimal interface:

    - addText(text)
    - __addSublanguage(emitter, subLanguageName)
    - startScope(scope)
    - endScope()
    - finalize()
    - toHTML()

  */

  /**
   * @implements {Emitter}
   */
  class TokenTreeEmitter extends TokenTree {
    /**
     * @param {*} options
     */
    constructor(options) {
      super();
      this.options = options;
    }

    /**
     * @param {string} text
     */
    addText(text) {
      if (text === "") { return; }

      this.add(text);
    }

    /** @param {string} scope */
    startScope(scope) {
      this.openNode(scope);
    }

    endScope() {
      this.closeNode();
    }

    /**
     * @param {Emitter & {root: DataNode}} emitter
     * @param {string} name
     */
    __addSublanguage(emitter, name) {
      /** @type DataNode */
      const node = emitter.root;
      if (name) node.scope = `language:${name}`;

      this.add(node);
    }

    toHTML() {
      const renderer = new HTMLRenderer(this, this.options);
      return renderer.value();
    }

    finalize() {
      this.closeAllNodes();
      return true;
    }
  }

  /**
   * @param {string} value
   * @returns {RegExp}
   * */

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;

    return re.source;
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function lookahead(re) {
    return concat('(?=', re, ')');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function anyNumberOfTimes(re) {
    return concat('(?:', re, ')*');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function optional(re) {
    return concat('(?:', re, ')?');
  }

  /**
   * @param {...(RegExp | string) } args
   * @returns {string}
   */
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }

  /**
   * @param { Array<string | RegExp | Object> } args
   * @returns {object}
   */
  function stripOptionsFromArgs(args) {
    const opts = args[args.length - 1];

    if (typeof opts === 'object' && opts.constructor === Object) {
      args.splice(args.length - 1, 1);
      return opts;
    } else {
      return {};
    }
  }

  /** @typedef { {capture?: boolean} } RegexEitherOptions */

  /**
   * Any of the passed expresssions may match
   *
   * Creates a huge this | this | that | that match
   * @param {(RegExp | string)[] | [...(RegExp | string)[], RegexEitherOptions]} args
   * @returns {string}
   */
  function either(...args) {
    /** @type { object & {capture?: boolean} }  */
    const opts = stripOptionsFromArgs(args);
    const joined = '('
      + (opts.capture ? "" : "?:")
      + args.map((x) => source(x)).join("|") + ")";
    return joined;
  }

  /**
   * @param {RegExp | string} re
   * @returns {number}
   */
  function countMatchGroups(re) {
    return (new RegExp(re.toString() + '|')).exec('').length - 1;
  }

  /**
   * Does lexeme start with a regular expression match at the beginning
   * @param {RegExp} re
   * @param {string} lexeme
   */
  function startsWith(re, lexeme) {
    const match = re && re.exec(lexeme);
    return match && match.index === 0;
  }

  // BACKREF_RE matches an open parenthesis or backreference. To avoid
  // an incorrect parse, it additionally matches the following:
  // - [...] elements, where the meaning of parentheses and escapes change
  // - other escape sequences, so we do not misparse escape sequences as
  //   interesting elements
  // - non-matching or lookahead parentheses, which do not capture. These
  //   follow the '(' with a '?'.
  const BACKREF_RE = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;

  // **INTERNAL** Not intended for outside usage
  // join logically computes regexps.join(separator), but fixes the
  // backreferences so they continue to match.
  // it also places each individual regular expression into it's own
  // match group, keeping track of the sequencing of those match groups
  // is currently an exercise for the caller. :-)
  /**
   * @param {(string | RegExp)[]} regexps
   * @param {{joinWith: string}} opts
   * @returns {string}
   */
  function _rewriteBackreferences(regexps, { joinWith }) {
    let numCaptures = 0;

    return regexps.map((regex) => {
      numCaptures += 1;
      const offset = numCaptures;
      let re = source(regex);
      let out = '';

      while (re.length > 0) {
        const match = BACKREF_RE.exec(re);
        if (!match) {
          out += re;
          break;
        }
        out += re.substring(0, match.index);
        re = re.substring(match.index + match[0].length);
        if (match[0][0] === '\\' && match[1]) {
          // Adjust the backreference.
          out += '\\' + String(Number(match[1]) + offset);
        } else {
          out += match[0];
          if (match[0] === '(') {
            numCaptures++;
          }
        }
      }
      return out;
    }).map(re => `(${re})`).join(joinWith);
  }

  /** @typedef {import('highlight.js').Mode} Mode */
  /** @typedef {import('highlight.js').ModeCallback} ModeCallback */

  // Common regexps
  const MATCH_NOTHING_RE = /\b\B/;
  const IDENT_RE = '[a-zA-Z]\\w*';
  const UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  const NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  const C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  const BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  const RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  /**
  * @param { Partial<Mode> & {binary?: string | RegExp} } opts
  */
  const SHEBANG = (opts = {}) => {
    const beginShebang = /^#![ ]*\//;
    if (opts.binary) {
      opts.begin = concat(
        beginShebang,
        /.*\b/,
        opts.binary,
        /\b.*/);
    }
    return inherit$1({
      scope: 'meta',
      begin: beginShebang,
      end: /$/,
      relevance: 0,
      /** @type {ModeCallback} */
      "on:begin": (m, resp) => {
        if (m.index !== 0) resp.ignoreMatch();
      }
    }, opts);
  };

  // Common modes
  const BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  const APOS_STRING_MODE = {
    scope: 'string',
    begin: '\'',
    end: '\'',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const QUOTE_STRING_MODE = {
    scope: 'string',
    begin: '"',
    end: '"',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
  };
  /**
   * Creates a comment mode
   *
   * @param {string | RegExp} begin
   * @param {string | RegExp} end
   * @param {Mode | {}} [modeOptions]
   * @returns {Partial<Mode>}
   */
  const COMMENT = function(begin, end, modeOptions = {}) {
    const mode = inherit$1(
      {
        scope: 'comment',
        begin,
        end,
        contains: []
      },
      modeOptions
    );
    mode.contains.push({
      scope: 'doctag',
      // hack to avoid the space from being included. the space is necessary to
      // match here to prevent the plain text rule below from gobbling up doctags
      begin: '[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)',
      end: /(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,
      excludeBegin: true,
      relevance: 0
    });
    const ENGLISH_WORD = either(
      // list of common 1 and 2 letter words in English
      "I",
      "a",
      "is",
      "so",
      "us",
      "to",
      "at",
      "if",
      "in",
      "it",
      "on",
      // note: this is not an exhaustive list of contractions, just popular ones
      /[A-Za-z]+['](d|ve|re|ll|t|s|n)/, // contractions - can't we'd they're let's, etc
      /[A-Za-z]+[-][a-z]+/, // `no-way`, etc.
      /[A-Za-z][a-z]{2,}/ // allow capitalized words at beginning of sentences
    );
    // looking like plain text, more likely to be a comment
    mode.contains.push(
      {
        // TODO: how to include ", (, ) without breaking grammars that use these for
        // comment delimiters?
        // begin: /[ ]+([()"]?([A-Za-z'-]{3,}|is|a|I|so|us|[tT][oO]|at|if|in|it|on)[.]?[()":]?([.][ ]|[ ]|\))){3}/
        // ---

        // this tries to find sequences of 3 english words in a row (without any
        // "programming" type syntax) this gives us a strong signal that we've
        // TRULY found a comment - vs perhaps scanning with the wrong language.
        // It's possible to find something that LOOKS like the start of the
        // comment - but then if there is no readable text - good chance it is a
        // false match and not a comment.
        //
        // for a visual example please see:
        // https://github.com/highlightjs/highlight.js/issues/2827

        begin: concat(
          /[ ]+/, // necessary to prevent us gobbling up doctags like /* @author Bob Mcgill */
          '(',
          ENGLISH_WORD,
          /[.]?[:]?([.][ ]|[ ])/,
          '){3}') // look for 3 words in a row
      }
    );
    return mode;
  };
  const C_LINE_COMMENT_MODE = COMMENT('//', '$');
  const C_BLOCK_COMMENT_MODE = COMMENT('/\\*', '\\*/');
  const HASH_COMMENT_MODE = COMMENT('#', '$');
  const NUMBER_MODE = {
    scope: 'number',
    begin: NUMBER_RE,
    relevance: 0
  };
  const C_NUMBER_MODE = {
    scope: 'number',
    begin: C_NUMBER_RE,
    relevance: 0
  };
  const BINARY_NUMBER_MODE = {
    scope: 'number',
    begin: BINARY_NUMBER_RE,
    relevance: 0
  };
  const REGEXP_MODE = {
    scope: "regexp",
    begin: /\/(?=[^/\n]*\/)/,
    end: /\/[gimuy]*/,
    contains: [
      BACKSLASH_ESCAPE,
      {
        begin: /\[/,
        end: /\]/,
        relevance: 0,
        contains: [BACKSLASH_ESCAPE]
      }
    ]
  };
  const TITLE_MODE = {
    scope: 'title',
    begin: IDENT_RE,
    relevance: 0
  };
  const UNDERSCORE_TITLE_MODE = {
    scope: 'title',
    begin: UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  const METHOD_GUARD = {
    // excludes method names from keyword processing
    begin: '\\.\\s*' + UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  /**
   * Adds end same as begin mechanics to a mode
   *
   * Your mode must include at least a single () match group as that first match
   * group is what is used for comparison
   * @param {Partial<Mode>} mode
   */
  const END_SAME_AS_BEGIN = function(mode) {
    return Object.assign(mode,
      {
        /** @type {ModeCallback} */
        'on:begin': (m, resp) => { resp.data._beginMatch = m[1]; },
        /** @type {ModeCallback} */
        'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); }
      });
  };

  var MODES = /*#__PURE__*/Object.freeze({
    __proto__: null,
    APOS_STRING_MODE: APOS_STRING_MODE,
    BACKSLASH_ESCAPE: BACKSLASH_ESCAPE,
    BINARY_NUMBER_MODE: BINARY_NUMBER_MODE,
    BINARY_NUMBER_RE: BINARY_NUMBER_RE,
    COMMENT: COMMENT,
    C_BLOCK_COMMENT_MODE: C_BLOCK_COMMENT_MODE,
    C_LINE_COMMENT_MODE: C_LINE_COMMENT_MODE,
    C_NUMBER_MODE: C_NUMBER_MODE,
    C_NUMBER_RE: C_NUMBER_RE,
    END_SAME_AS_BEGIN: END_SAME_AS_BEGIN,
    HASH_COMMENT_MODE: HASH_COMMENT_MODE,
    IDENT_RE: IDENT_RE,
    MATCH_NOTHING_RE: MATCH_NOTHING_RE,
    METHOD_GUARD: METHOD_GUARD,
    NUMBER_MODE: NUMBER_MODE,
    NUMBER_RE: NUMBER_RE,
    PHRASAL_WORDS_MODE: PHRASAL_WORDS_MODE,
    QUOTE_STRING_MODE: QUOTE_STRING_MODE,
    REGEXP_MODE: REGEXP_MODE,
    RE_STARTERS_RE: RE_STARTERS_RE,
    SHEBANG: SHEBANG,
    TITLE_MODE: TITLE_MODE,
    UNDERSCORE_IDENT_RE: UNDERSCORE_IDENT_RE,
    UNDERSCORE_TITLE_MODE: UNDERSCORE_TITLE_MODE
  });

  /**
  @typedef {import('highlight.js').CallbackResponse} CallbackResponse
  @typedef {import('highlight.js').CompilerExt} CompilerExt
  */

  // Grammar extensions / plugins
  // See: https://github.com/highlightjs/highlight.js/issues/2833

  // Grammar extensions allow "syntactic sugar" to be added to the grammar modes
  // without requiring any underlying changes to the compiler internals.

  // `compileMatch` being the perfect small example of now allowing a grammar
  // author to write `match` when they desire to match a single expression rather
  // than being forced to use `begin`.  The extension then just moves `match` into
  // `begin` when it runs.  Ie, no features have been added, but we've just made
  // the experience of writing (and reading grammars) a little bit nicer.

  // ------

  // TODO: We need negative look-behind support to do this properly
  /**
   * Skip a match if it has a preceding dot
   *
   * This is used for `beginKeywords` to prevent matching expressions such as
   * `bob.keyword.do()`. The mode compiler automatically wires this up as a
   * special _internal_ 'on:begin' callback for modes with `beginKeywords`
   * @param {RegExpMatchArray} match
   * @param {CallbackResponse} response
   */
  function skipIfHasPrecedingDot(match, response) {
    const before = match.input[match.index - 1];
    if (before === ".") {
      response.ignoreMatch();
    }
  }

  /**
   *
   * @type {CompilerExt}
   */
  function scopeClassName(mode, _parent) {
    // eslint-disable-next-line no-undefined
    if (mode.className !== undefined) {
      mode.scope = mode.className;
      delete mode.className;
    }
  }

  /**
   * `beginKeywords` syntactic sugar
   * @type {CompilerExt}
   */
  function beginKeywords(mode, parent) {
    if (!parent) return;
    if (!mode.beginKeywords) return;

    // for languages with keywords that include non-word characters checking for
    // a word boundary is not sufficient, so instead we check for a word boundary
    // or whitespace - this does no harm in any case since our keyword engine
    // doesn't allow spaces in keywords anyways and we still check for the boundary
    // first
    mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')(?!\\.)(?=\\b|\\s)';
    mode.__beforeBegin = skipIfHasPrecedingDot;
    mode.keywords = mode.keywords || mode.beginKeywords;
    delete mode.beginKeywords;

    // prevents double relevance, the keywords themselves provide
    // relevance, the mode doesn't need to double it
    // eslint-disable-next-line no-undefined
    if (mode.relevance === undefined) mode.relevance = 0;
  }

  /**
   * Allow `illegal` to contain an array of illegal values
   * @type {CompilerExt}
   */
  function compileIllegal(mode, _parent) {
    if (!Array.isArray(mode.illegal)) return;

    mode.illegal = either(...mode.illegal);
  }

  /**
   * `match` to match a single expression for readability
   * @type {CompilerExt}
   */
  function compileMatch(mode, _parent) {
    if (!mode.match) return;
    if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");

    mode.begin = mode.match;
    delete mode.match;
  }

  /**
   * provides the default 1 relevance to all modes
   * @type {CompilerExt}
   */
  function compileRelevance(mode, _parent) {
    // eslint-disable-next-line no-undefined
    if (mode.relevance === undefined) mode.relevance = 1;
  }

  // allow beforeMatch to act as a "qualifier" for the match
  // the full match begin must be [beforeMatch][begin]
  const beforeMatchExt = (mode, parent) => {
    if (!mode.beforeMatch) return;
    // starts conflicts with endsParent which we need to make sure the child
    // rule is not matched multiple times
    if (mode.starts) throw new Error("beforeMatch cannot be used with starts");

    const originalMode = Object.assign({}, mode);
    Object.keys(mode).forEach((key) => { delete mode[key]; });

    mode.keywords = originalMode.keywords;
    mode.begin = concat(originalMode.beforeMatch, lookahead(originalMode.begin));
    mode.starts = {
      relevance: 0,
      contains: [
        Object.assign(originalMode, { endsParent: true })
      ]
    };
    mode.relevance = 0;

    delete originalMode.beforeMatch;
  };

  // keywords that should have no default relevance value
  const COMMON_KEYWORDS = [
    'of',
    'and',
    'for',
    'in',
    'not',
    'or',
    'if',
    'then',
    'parent', // common variable name
    'list', // common variable name
    'value' // common variable name
  ];

  const DEFAULT_KEYWORD_SCOPE = "keyword";

  /**
   * Given raw keywords from a language definition, compile them.
   *
   * @param {string | Record<string,string|string[]> | Array<string>} rawKeywords
   * @param {boolean} caseInsensitive
   */
  function compileKeywords(rawKeywords, caseInsensitive, scopeName = DEFAULT_KEYWORD_SCOPE) {
    /** @type {import("highlight.js/private").KeywordDict} */
    const compiledKeywords = Object.create(null);

    // input can be a string of keywords, an array of keywords, or a object with
    // named keys representing scopeName (which can then point to a string or array)
    if (typeof rawKeywords === 'string') {
      compileList(scopeName, rawKeywords.split(" "));
    } else if (Array.isArray(rawKeywords)) {
      compileList(scopeName, rawKeywords);
    } else {
      Object.keys(rawKeywords).forEach(function(scopeName) {
        // collapse all our objects back into the parent object
        Object.assign(
          compiledKeywords,
          compileKeywords(rawKeywords[scopeName], caseInsensitive, scopeName)
        );
      });
    }
    return compiledKeywords;

    // ---

    /**
     * Compiles an individual list of keywords
     *
     * Ex: "for if when while|5"
     *
     * @param {string} scopeName
     * @param {Array<string>} keywordList
     */
    function compileList(scopeName, keywordList) {
      if (caseInsensitive) {
        keywordList = keywordList.map(x => x.toLowerCase());
      }
      keywordList.forEach(function(keyword) {
        const pair = keyword.split('|');
        compiledKeywords[pair[0]] = [scopeName, scoreForKeyword(pair[0], pair[1])];
      });
    }
  }

  /**
   * Returns the proper score for a given keyword
   *
   * Also takes into account comment keywords, which will be scored 0 UNLESS
   * another score has been manually assigned.
   * @param {string} keyword
   * @param {string} [providedScore]
   */
  function scoreForKeyword(keyword, providedScore) {
    // manual scores always win over common keywords
    // so you can force a score of 1 if you really insist
    if (providedScore) {
      return Number(providedScore);
    }

    return commonKeyword(keyword) ? 0 : 1;
  }

  /**
   * Determines if a given keyword is common or not
   *
   * @param {string} keyword */
  function commonKeyword(keyword) {
    return COMMON_KEYWORDS.includes(keyword.toLowerCase());
  }

  /*

  For the reasoning behind this please see:
  https://github.com/highlightjs/highlight.js/issues/2880#issuecomment-747275419

  */

  /**
   * @type {Record<string, boolean>}
   */
  const seenDeprecations = {};

  /**
   * @param {string} message
   */
  const error = (message) => {
    console.error(message);
  };

  /**
   * @param {string} message
   * @param {any} args
   */
  const warn = (message, ...args) => {
    console.log(`WARN: ${message}`, ...args);
  };

  /**
   * @param {string} version
   * @param {string} message
   */
  const deprecated = (version, message) => {
    if (seenDeprecations[`${version}/${message}`]) return;

    console.log(`Deprecated as of ${version}. ${message}`);
    seenDeprecations[`${version}/${message}`] = true;
  };

  /* eslint-disable no-throw-literal */

  /**
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  */

  const MultiClassError = new Error();

  /**
   * Renumbers labeled scope names to account for additional inner match
   * groups that otherwise would break everything.
   *
   * Lets say we 3 match scopes:
   *
   *   { 1 => ..., 2 => ..., 3 => ... }
   *
   * So what we need is a clean match like this:
   *
   *   (a)(b)(c) => [ "a", "b", "c" ]
   *
   * But this falls apart with inner match groups:
   *
   * (a)(((b)))(c) => ["a", "b", "b", "b", "c" ]
   *
   * Our scopes are now "out of alignment" and we're repeating `b` 3 times.
   * What needs to happen is the numbers are remapped:
   *
   *   { 1 => ..., 2 => ..., 5 => ... }
   *
   * We also need to know that the ONLY groups that should be output
   * are 1, 2, and 5.  This function handles this behavior.
   *
   * @param {CompiledMode} mode
   * @param {Array<RegExp | string>} regexes
   * @param {{key: "beginScope"|"endScope"}} opts
   */
  function remapScopeNames(mode, regexes, { key }) {
    let offset = 0;
    const scopeNames = mode[key];
    /** @type Record<number,boolean> */
    const emit = {};
    /** @type Record<number,string> */
    const positions = {};

    for (let i = 1; i <= regexes.length; i++) {
      positions[i + offset] = scopeNames[i];
      emit[i + offset] = true;
      offset += countMatchGroups(regexes[i - 1]);
    }
    // we use _emit to keep track of which match groups are "top-level" to avoid double
    // output from inside match groups
    mode[key] = positions;
    mode[key]._emit = emit;
    mode[key]._multi = true;
  }

  /**
   * @param {CompiledMode} mode
   */
  function beginMultiClass(mode) {
    if (!Array.isArray(mode.begin)) return;

    if (mode.skip || mode.excludeBegin || mode.returnBegin) {
      error("skip, excludeBegin, returnBegin not compatible with beginScope: {}");
      throw MultiClassError;
    }

    if (typeof mode.beginScope !== "object" || mode.beginScope === null) {
      error("beginScope must be object");
      throw MultiClassError;
    }

    remapScopeNames(mode, mode.begin, { key: "beginScope" });
    mode.begin = _rewriteBackreferences(mode.begin, { joinWith: "" });
  }

  /**
   * @param {CompiledMode} mode
   */
  function endMultiClass(mode) {
    if (!Array.isArray(mode.end)) return;

    if (mode.skip || mode.excludeEnd || mode.returnEnd) {
      error("skip, excludeEnd, returnEnd not compatible with endScope: {}");
      throw MultiClassError;
    }

    if (typeof mode.endScope !== "object" || mode.endScope === null) {
      error("endScope must be object");
      throw MultiClassError;
    }

    remapScopeNames(mode, mode.end, { key: "endScope" });
    mode.end = _rewriteBackreferences(mode.end, { joinWith: "" });
  }

  /**
   * this exists only to allow `scope: {}` to be used beside `match:`
   * Otherwise `beginScope` would necessary and that would look weird

    {
      match: [ /def/, /\w+/ ]
      scope: { 1: "keyword" , 2: "title" }
    }

   * @param {CompiledMode} mode
   */
  function scopeSugar(mode) {
    if (mode.scope && typeof mode.scope === "object" && mode.scope !== null) {
      mode.beginScope = mode.scope;
      delete mode.scope;
    }
  }

  /**
   * @param {CompiledMode} mode
   */
  function MultiClass(mode) {
    scopeSugar(mode);

    if (typeof mode.beginScope === "string") {
      mode.beginScope = { _wrap: mode.beginScope };
    }
    if (typeof mode.endScope === "string") {
      mode.endScope = { _wrap: mode.endScope };
    }

    beginMultiClass(mode);
    endMultiClass(mode);
  }

  /**
  @typedef {import('highlight.js').Mode} Mode
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  @typedef {import('highlight.js').Language} Language
  @typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
  @typedef {import('highlight.js').CompiledLanguage} CompiledLanguage
  */

  // compilation

  /**
   * Compiles a language definition result
   *
   * Given the raw result of a language definition (Language), compiles this so
   * that it is ready for highlighting code.
   * @param {Language} language
   * @returns {CompiledLanguage}
   */
  function compileLanguage(language) {
    /**
     * Builds a regex with the case sensitivity of the current language
     *
     * @param {RegExp | string} value
     * @param {boolean} [global]
     */
    function langRe(value, global) {
      return new RegExp(
        source(value),
        'm'
        + (language.case_insensitive ? 'i' : '')
        + (language.unicodeRegex ? 'u' : '')
        + (global ? 'g' : '')
      );
    }

    /**
      Stores multiple regular expressions and allows you to quickly search for
      them all in a string simultaneously - returning the first match.  It does
      this by creating a huge (a|b|c) regex - each individual item wrapped with ()
      and joined by `|` - using match groups to track position.  When a match is
      found checking which position in the array has content allows us to figure
      out which of the original regexes / match groups triggered the match.

      The match object itself (the result of `Regex.exec`) is returned but also
      enhanced by merging in any meta-data that was registered with the regex.
      This is how we keep track of which mode matched, and what type of rule
      (`illegal`, `begin`, end, etc).
    */
    class MultiRegex {
      constructor() {
        this.matchIndexes = {};
        // @ts-ignore
        this.regexes = [];
        this.matchAt = 1;
        this.position = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        opts.position = this.position++;
        // @ts-ignore
        this.matchIndexes[this.matchAt] = opts;
        this.regexes.push([opts, re]);
        this.matchAt += countMatchGroups(re) + 1;
      }

      compile() {
        if (this.regexes.length === 0) {
          // avoids the need to check length every time exec is called
          // @ts-ignore
          this.exec = () => null;
        }
        const terminators = this.regexes.map(el => el[1]);
        this.matcherRe = langRe(_rewriteBackreferences(terminators, { joinWith: '|' }), true);
        this.lastIndex = 0;
      }

      /** @param {string} s */
      exec(s) {
        this.matcherRe.lastIndex = this.lastIndex;
        const match = this.matcherRe.exec(s);
        if (!match) { return null; }

        // eslint-disable-next-line no-undefined
        const i = match.findIndex((el, i) => i > 0 && el !== undefined);
        // @ts-ignore
        const matchData = this.matchIndexes[i];
        // trim off any earlier non-relevant match groups (ie, the other regex
        // match groups that make up the multi-matcher)
        match.splice(0, i);

        return Object.assign(match, matchData);
      }
    }

    /*
      Created to solve the key deficiently with MultiRegex - there is no way to
      test for multiple matches at a single location.  Why would we need to do
      that?  In the future a more dynamic engine will allow certain matches to be
      ignored.  An example: if we matched say the 3rd regex in a large group but
      decided to ignore it - we'd need to started testing again at the 4th
      regex... but MultiRegex itself gives us no real way to do that.

      So what this class creates MultiRegexs on the fly for whatever search
      position they are needed.

      NOTE: These additional MultiRegex objects are created dynamically.  For most
      grammars most of the time we will never actually need anything more than the
      first MultiRegex - so this shouldn't have too much overhead.

      Say this is our search group, and we match regex3, but wish to ignore it.

        regex1 | regex2 | regex3 | regex4 | regex5    ' ie, startAt = 0

      What we need is a new MultiRegex that only includes the remaining
      possibilities:

        regex4 | regex5                               ' ie, startAt = 3

      This class wraps all that complexity up in a simple API... `startAt` decides
      where in the array of expressions to start doing the matching. It
      auto-increments, so if a match is found at position 2, then startAt will be
      set to 3.  If the end is reached startAt will return to 0.

      MOST of the time the parser will be setting startAt manually to 0.
    */
    class ResumableMultiRegex {
      constructor() {
        // @ts-ignore
        this.rules = [];
        // @ts-ignore
        this.multiRegexes = [];
        this.count = 0;

        this.lastIndex = 0;
        this.regexIndex = 0;
      }

      // @ts-ignore
      getMatcher(index) {
        if (this.multiRegexes[index]) return this.multiRegexes[index];

        const matcher = new MultiRegex();
        this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
        matcher.compile();
        this.multiRegexes[index] = matcher;
        return matcher;
      }

      resumingScanAtSamePosition() {
        return this.regexIndex !== 0;
      }

      considerAll() {
        this.regexIndex = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        this.rules.push([re, opts]);
        if (opts.type === "begin") this.count++;
      }

      /** @param {string} s */
      exec(s) {
        const m = this.getMatcher(this.regexIndex);
        m.lastIndex = this.lastIndex;
        let result = m.exec(s);

        // The following is because we have no easy way to say "resume scanning at the
        // existing position but also skip the current rule ONLY". What happens is
        // all prior rules are also skipped which can result in matching the wrong
        // thing. Example of matching "booger":

        // our matcher is [string, "booger", number]
        //
        // ....booger....

        // if "booger" is ignored then we'd really need a regex to scan from the
        // SAME position for only: [string, number] but ignoring "booger" (if it
        // was the first match), a simple resume would scan ahead who knows how
        // far looking only for "number", ignoring potential string matches (or
        // future "booger" matches that might be valid.)

        // So what we do: We execute two matchers, one resuming at the same
        // position, but the second full matcher starting at the position after:

        //     /--- resume first regex match here (for [number])
        //     |/---- full match here for [string, "booger", number]
        //     vv
        // ....booger....

        // Which ever results in a match first is then used. So this 3-4 step
        // process essentially allows us to say "match at this position, excluding
        // a prior rule that was ignored".
        //
        // 1. Match "booger" first, ignore. Also proves that [string] does non match.
        // 2. Resume matching for [number]
        // 3. Match at index + 1 for [string, "booger", number]
        // 4. If #2 and #3 result in matches, which came first?
        if (this.resumingScanAtSamePosition()) {
          if (result && result.index === this.lastIndex) ; else { // use the second matcher result
            const m2 = this.getMatcher(0);
            m2.lastIndex = this.lastIndex + 1;
            result = m2.exec(s);
          }
        }

        if (result) {
          this.regexIndex += result.position + 1;
          if (this.regexIndex === this.count) {
            // wrap-around to considering all matches again
            this.considerAll();
          }
        }

        return result;
      }
    }

    /**
     * Given a mode, builds a huge ResumableMultiRegex that can be used to walk
     * the content and find matches.
     *
     * @param {CompiledMode} mode
     * @returns {ResumableMultiRegex}
     */
    function buildModeRegex(mode) {
      const mm = new ResumableMultiRegex();

      mode.contains.forEach(term => mm.addRule(term.begin, { rule: term, type: "begin" }));

      if (mode.terminatorEnd) {
        mm.addRule(mode.terminatorEnd, { type: "end" });
      }
      if (mode.illegal) {
        mm.addRule(mode.illegal, { type: "illegal" });
      }

      return mm;
    }

    /** skip vs abort vs ignore
     *
     * @skip   - The mode is still entered and exited normally (and contains rules apply),
     *           but all content is held and added to the parent buffer rather than being
     *           output when the mode ends.  Mostly used with `sublanguage` to build up
     *           a single large buffer than can be parsed by sublanguage.
     *
     *             - The mode begin ands ends normally.
     *             - Content matched is added to the parent mode buffer.
     *             - The parser cursor is moved forward normally.
     *
     * @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
     *           never matched) but DOES NOT continue to match subsequent `contains`
     *           modes.  Abort is bad/suboptimal because it can result in modes
     *           farther down not getting applied because an earlier rule eats the
     *           content but then aborts.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is added to the mode buffer.
     *             - The parser cursor is moved forward accordingly.
     *
     * @ignore - Ignores the mode (as if it never matched) and continues to match any
     *           subsequent `contains` modes.  Ignore isn't technically possible with
     *           the current parser implementation.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is ignored.
     *             - The parser cursor is not moved forward.
     */

    /**
     * Compiles an individual mode
     *
     * This can raise an error if the mode contains certain detectable known logic
     * issues.
     * @param {Mode} mode
     * @param {CompiledMode | null} [parent]
     * @returns {CompiledMode | never}
     */
    function compileMode(mode, parent) {
      const cmode = /** @type CompiledMode */ (mode);
      if (mode.isCompiled) return cmode;

      [
        scopeClassName,
        // do this early so compiler extensions generally don't have to worry about
        // the distinction between match/begin
        compileMatch,
        MultiClass,
        beforeMatchExt
      ].forEach(ext => ext(mode, parent));

      language.compilerExtensions.forEach(ext => ext(mode, parent));

      // __beforeBegin is considered private API, internal use only
      mode.__beforeBegin = null;

      [
        beginKeywords,
        // do this later so compiler extensions that come earlier have access to the
        // raw array if they wanted to perhaps manipulate it, etc.
        compileIllegal,
        // default to 1 relevance if not specified
        compileRelevance
      ].forEach(ext => ext(mode, parent));

      mode.isCompiled = true;

      let keywordPattern = null;
      if (typeof mode.keywords === "object" && mode.keywords.$pattern) {
        // we need a copy because keywords might be compiled multiple times
        // so we can't go deleting $pattern from the original on the first
        // pass
        mode.keywords = Object.assign({}, mode.keywords);
        keywordPattern = mode.keywords.$pattern;
        delete mode.keywords.$pattern;
      }
      keywordPattern = keywordPattern || /\w+/;

      if (mode.keywords) {
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
      }

      cmode.keywordPatternRe = langRe(keywordPattern, true);

      if (parent) {
        if (!mode.begin) mode.begin = /\B|\b/;
        cmode.beginRe = langRe(cmode.begin);
        if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
        if (mode.end) cmode.endRe = langRe(cmode.end);
        cmode.terminatorEnd = source(cmode.end) || '';
        if (mode.endsWithParent && parent.terminatorEnd) {
          cmode.terminatorEnd += (mode.end ? '|' : '') + parent.terminatorEnd;
        }
      }
      if (mode.illegal) cmode.illegalRe = langRe(/** @type {RegExp | string} */ (mode.illegal));
      if (!mode.contains) mode.contains = [];

      mode.contains = [].concat(...mode.contains.map(function(c) {
        return expandOrCloneMode(c === 'self' ? mode : c);
      }));
      mode.contains.forEach(function(c) { compileMode(/** @type Mode */ (c), cmode); });

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      cmode.matcher = buildModeRegex(cmode);
      return cmode;
    }

    if (!language.compilerExtensions) language.compilerExtensions = [];

    // self is not valid at the top-level
    if (language.contains && language.contains.includes('self')) {
      throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
    }

    // we need a null object, which inherit will guarantee
    language.classNameAliases = inherit$1(language.classNameAliases || {});

    return compileMode(/** @type Mode */ (language));
  }

  /**
   * Determines if a mode has a dependency on it's parent or not
   *
   * If a mode does have a parent dependency then often we need to clone it if
   * it's used in multiple places so that each copy points to the correct parent,
   * where-as modes without a parent can often safely be re-used at the bottom of
   * a mode chain.
   *
   * @param {Mode | null} mode
   * @returns {boolean} - is there a dependency on the parent?
   * */
  function dependencyOnParent(mode) {
    if (!mode) return false;

    return mode.endsWithParent || dependencyOnParent(mode.starts);
  }

  /**
   * Expands a mode or clones it if necessary
   *
   * This is necessary for modes with parental dependenceis (see notes on
   * `dependencyOnParent`) and for nodes that have `variants` - which must then be
   * exploded into their own individual modes at compile time.
   *
   * @param {Mode} mode
   * @returns {Mode | Mode[]}
   * */
  function expandOrCloneMode(mode) {
    if (mode.variants && !mode.cachedVariants) {
      mode.cachedVariants = mode.variants.map(function(variant) {
        return inherit$1(mode, { variants: null }, variant);
      });
    }

    // EXPAND
    // if we have variants then essentially "replace" the mode with the variants
    // this happens in compileMode, where this function is called from
    if (mode.cachedVariants) {
      return mode.cachedVariants;
    }

    // CLONE
    // if we have dependencies on parents then we need a unique
    // instance of ourselves, so we can be reused with many
    // different parents without issue
    if (dependencyOnParent(mode)) {
      return inherit$1(mode, { starts: mode.starts ? inherit$1(mode.starts) : null });
    }

    if (Object.isFrozen(mode)) {
      return inherit$1(mode);
    }

    // no special dependency issues, just return ourselves
    return mode;
  }

  var version = "11.9.0";

  class HTMLInjectionError extends Error {
    constructor(reason, html) {
      super(reason);
      this.name = "HTMLInjectionError";
      this.html = html;
    }
  }

  /*
  Syntax highlighting with language autodetection.
  https://highlightjs.org/
  */



  /**
  @typedef {import('highlight.js').Mode} Mode
  @typedef {import('highlight.js').CompiledMode} CompiledMode
  @typedef {import('highlight.js').CompiledScope} CompiledScope
  @typedef {import('highlight.js').Language} Language
  @typedef {import('highlight.js').HLJSApi} HLJSApi
  @typedef {import('highlight.js').HLJSPlugin} HLJSPlugin
  @typedef {import('highlight.js').PluginEvent} PluginEvent
  @typedef {import('highlight.js').HLJSOptions} HLJSOptions
  @typedef {import('highlight.js').LanguageFn} LanguageFn
  @typedef {import('highlight.js').HighlightedHTMLElement} HighlightedHTMLElement
  @typedef {import('highlight.js').BeforeHighlightContext} BeforeHighlightContext
  @typedef {import('highlight.js/private').MatchType} MatchType
  @typedef {import('highlight.js/private').KeywordData} KeywordData
  @typedef {import('highlight.js/private').EnhancedMatch} EnhancedMatch
  @typedef {import('highlight.js/private').AnnotatedError} AnnotatedError
  @typedef {import('highlight.js').AutoHighlightResult} AutoHighlightResult
  @typedef {import('highlight.js').HighlightOptions} HighlightOptions
  @typedef {import('highlight.js').HighlightResult} HighlightResult
  */


  const escape = escapeHTML;
  const inherit = inherit$1;
  const NO_MATCH = Symbol("nomatch");
  const MAX_KEYWORD_HITS = 7;

  /**
   * @param {any} hljs - object that is extended (legacy)
   * @returns {HLJSApi}
   */
  const HLJS = function(hljs) {
    // Global internal variables used within the highlight.js library.
    /** @type {Record<string, Language>} */
    const languages = Object.create(null);
    /** @type {Record<string, string>} */
    const aliases = Object.create(null);
    /** @type {HLJSPlugin[]} */
    const plugins = [];

    // safe/production mode - swallows more errors, tries to keep running
    // even if a single syntax or parse hits a fatal error
    let SAFE_MODE = true;
    const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
    /** @type {Language} */
    const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: 'Plain text', contains: [] };

    // Global options used when within external APIs. This is modified when
    // calling the `hljs.configure` function.
    /** @type HLJSOptions */
    let options = {
      ignoreUnescapedHTML: false,
      throwUnescapedHTML: false,
      noHighlightRe: /^(no-?highlight)$/i,
      languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
      classPrefix: 'hljs-',
      cssSelector: 'pre code',
      languages: null,
      // beta configuration options, subject to change, welcome to discuss
      // https://github.com/highlightjs/highlight.js/issues/1086
      __emitter: TokenTreeEmitter
    };

    /* Utility functions */

    /**
     * Tests a language name to see if highlighting should be skipped
     * @param {string} languageName
     */
    function shouldNotHighlight(languageName) {
      return options.noHighlightRe.test(languageName);
    }

    /**
     * @param {HighlightedHTMLElement} block - the HTML element to determine language for
     */
    function blockLanguage(block) {
      let classes = block.className + ' ';

      classes += block.parentNode ? block.parentNode.className : '';

      // language-* takes precedence over non-prefixed class names.
      const match = options.languageDetectRe.exec(classes);
      if (match) {
        const language = getLanguage(match[1]);
        if (!language) {
          warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
          warn("Falling back to no-highlight mode for this block.", block);
        }
        return language ? match[1] : 'no-highlight';
      }

      return classes
        .split(/\s+/)
        .find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
    }

    /**
     * Core highlighting function.
     *
     * OLD API
     * highlight(lang, code, ignoreIllegals, continuation)
     *
     * NEW API
     * highlight(code, {lang, ignoreIllegals})
     *
     * @param {string} codeOrLanguageName - the language to use for highlighting
     * @param {string | HighlightOptions} optionsOrCode - the code to highlight
     * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     *
     * @returns {HighlightResult} Result - an object that represents the result
     * @property {string} language - the language name
     * @property {number} relevance - the relevance score
     * @property {string} value - the highlighted HTML code
     * @property {string} code - the original raw code
     * @property {CompiledMode} top - top of the current mode stack
     * @property {boolean} illegal - indicates whether any illegal matches were found
    */
    function highlight(codeOrLanguageName, optionsOrCode, ignoreIllegals) {
      let code = "";
      let languageName = "";
      if (typeof optionsOrCode === "object") {
        code = codeOrLanguageName;
        ignoreIllegals = optionsOrCode.ignoreIllegals;
        languageName = optionsOrCode.language;
      } else {
        // old API
        deprecated("10.7.0", "highlight(lang, code, ...args) has been deprecated.");
        deprecated("10.7.0", "Please use highlight(code, options) instead.\nhttps://github.com/highlightjs/highlight.js/issues/2277");
        languageName = codeOrLanguageName;
        code = optionsOrCode;
      }

      // https://github.com/highlightjs/highlight.js/issues/3149
      // eslint-disable-next-line no-undefined
      if (ignoreIllegals === undefined) { ignoreIllegals = true; }

      /** @type {BeforeHighlightContext} */
      const context = {
        code,
        language: languageName
      };
      // the plugin can change the desired language or the code to be highlighted
      // just be changing the object it was passed
      fire("before:highlight", context);

      // a before plugin can usurp the result completely by providing it's own
      // in which case we don't even need to call highlight
      const result = context.result
        ? context.result
        : _highlight(context.language, context.code, ignoreIllegals);

      result.code = context.code;
      // the plugin can change anything in result to suite it
      fire("after:highlight", result);

      return result;
    }

    /**
     * private highlight that's used internally and does not fire callbacks
     *
     * @param {string} languageName - the language to use for highlighting
     * @param {string} codeToHighlight - the code to highlight
     * @param {boolean?} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     * @param {CompiledMode?} [continuation] - current continuation mode, if any
     * @returns {HighlightResult} - result of the highlight operation
    */
    function _highlight(languageName, codeToHighlight, ignoreIllegals, continuation) {
      const keywordHits = Object.create(null);

      /**
       * Return keyword data if a match is a keyword
       * @param {CompiledMode} mode - current mode
       * @param {string} matchText - the textual match
       * @returns {KeywordData | false}
       */
      function keywordData(mode, matchText) {
        return mode.keywords[matchText];
      }

      function processKeywords() {
        if (!top.keywords) {
          emitter.addText(modeBuffer);
          return;
        }

        let lastIndex = 0;
        top.keywordPatternRe.lastIndex = 0;
        let match = top.keywordPatternRe.exec(modeBuffer);
        let buf = "";

        while (match) {
          buf += modeBuffer.substring(lastIndex, match.index);
          const word = language.case_insensitive ? match[0].toLowerCase() : match[0];
          const data = keywordData(top, word);
          if (data) {
            const [kind, keywordRelevance] = data;
            emitter.addText(buf);
            buf = "";

            keywordHits[word] = (keywordHits[word] || 0) + 1;
            if (keywordHits[word] <= MAX_KEYWORD_HITS) relevance += keywordRelevance;
            if (kind.startsWith("_")) {
              // _ implied for relevance only, do not highlight
              // by applying a class name
              buf += match[0];
            } else {
              const cssClass = language.classNameAliases[kind] || kind;
              emitKeyword(match[0], cssClass);
            }
          } else {
            buf += match[0];
          }
          lastIndex = top.keywordPatternRe.lastIndex;
          match = top.keywordPatternRe.exec(modeBuffer);
        }
        buf += modeBuffer.substring(lastIndex);
        emitter.addText(buf);
      }

      function processSubLanguage() {
        if (modeBuffer === "") return;
        /** @type HighlightResult */
        let result = null;

        if (typeof top.subLanguage === 'string') {
          if (!languages[top.subLanguage]) {
            emitter.addText(modeBuffer);
            return;
          }
          result = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
          continuations[top.subLanguage] = /** @type {CompiledMode} */ (result._top);
        } else {
          result = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
        }

        // Counting embedded language score towards the host language may be disabled
        // with zeroing the containing mode relevance. Use case in point is Markdown that
        // allows XML everywhere and makes every XML snippet to have a much larger Markdown
        // score.
        if (top.relevance > 0) {
          relevance += result.relevance;
        }
        emitter.__addSublanguage(result._emitter, result.language);
      }

      function processBuffer() {
        if (top.subLanguage != null) {
          processSubLanguage();
        } else {
          processKeywords();
        }
        modeBuffer = '';
      }

      /**
       * @param {string} text
       * @param {string} scope
       */
      function emitKeyword(keyword, scope) {
        if (keyword === "") return;

        emitter.startScope(scope);
        emitter.addText(keyword);
        emitter.endScope();
      }

      /**
       * @param {CompiledScope} scope
       * @param {RegExpMatchArray} match
       */
      function emitMultiClass(scope, match) {
        let i = 1;
        const max = match.length - 1;
        while (i <= max) {
          if (!scope._emit[i]) { i++; continue; }
          const klass = language.classNameAliases[scope[i]] || scope[i];
          const text = match[i];
          if (klass) {
            emitKeyword(text, klass);
          } else {
            modeBuffer = text;
            processKeywords();
            modeBuffer = "";
          }
          i++;
        }
      }

      /**
       * @param {CompiledMode} mode - new mode to start
       * @param {RegExpMatchArray} match
       */
      function startNewMode(mode, match) {
        if (mode.scope && typeof mode.scope === "string") {
          emitter.openNode(language.classNameAliases[mode.scope] || mode.scope);
        }
        if (mode.beginScope) {
          // beginScope just wraps the begin match itself in a scope
          if (mode.beginScope._wrap) {
            emitKeyword(modeBuffer, language.classNameAliases[mode.beginScope._wrap] || mode.beginScope._wrap);
            modeBuffer = "";
          } else if (mode.beginScope._multi) {
            // at this point modeBuffer should just be the match
            emitMultiClass(mode.beginScope, match);
            modeBuffer = "";
          }
        }

        top = Object.create(mode, { parent: { value: top } });
        return top;
      }

      /**
       * @param {CompiledMode } mode - the mode to potentially end
       * @param {RegExpMatchArray} match - the latest match
       * @param {string} matchPlusRemainder - match plus remainder of content
       * @returns {CompiledMode | void} - the next mode, or if void continue on in current mode
       */
      function endOfMode(mode, match, matchPlusRemainder) {
        let matched = startsWith(mode.endRe, matchPlusRemainder);

        if (matched) {
          if (mode["on:end"]) {
            const resp = new Response(mode);
            mode["on:end"](match, resp);
            if (resp.isMatchIgnored) matched = false;
          }

          if (matched) {
            while (mode.endsParent && mode.parent) {
              mode = mode.parent;
            }
            return mode;
          }
        }
        // even if on:end fires an `ignore` it's still possible
        // that we might trigger the end node because of a parent mode
        if (mode.endsWithParent) {
          return endOfMode(mode.parent, match, matchPlusRemainder);
        }
      }

      /**
       * Handle matching but then ignoring a sequence of text
       *
       * @param {string} lexeme - string containing full match text
       */
      function doIgnore(lexeme) {
        if (top.matcher.regexIndex === 0) {
          // no more regexes to potentially match here, so we move the cursor forward one
          // space
          modeBuffer += lexeme[0];
          return 1;
        } else {
          // no need to move the cursor, we still have additional regexes to try and
          // match at this very spot
          resumeScanAtSamePosition = true;
          return 0;
        }
      }

      /**
       * Handle the start of a new potential mode match
       *
       * @param {EnhancedMatch} match - the current match
       * @returns {number} how far to advance the parse cursor
       */
      function doBeginMatch(match) {
        const lexeme = match[0];
        const newMode = match.rule;

        const resp = new Response(newMode);
        // first internal before callbacks, then the public ones
        const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
        for (const cb of beforeCallbacks) {
          if (!cb) continue;
          cb(match, resp);
          if (resp.isMatchIgnored) return doIgnore(lexeme);
        }

        if (newMode.skip) {
          modeBuffer += lexeme;
        } else {
          if (newMode.excludeBegin) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (!newMode.returnBegin && !newMode.excludeBegin) {
            modeBuffer = lexeme;
          }
        }
        startNewMode(newMode, match);
        return newMode.returnBegin ? 0 : lexeme.length;
      }

      /**
       * Handle the potential end of mode
       *
       * @param {RegExpMatchArray} match - the current match
       */
      function doEndMatch(match) {
        const lexeme = match[0];
        const matchPlusRemainder = codeToHighlight.substring(match.index);

        const endMode = endOfMode(top, match, matchPlusRemainder);
        if (!endMode) { return NO_MATCH; }

        const origin = top;
        if (top.endScope && top.endScope._wrap) {
          processBuffer();
          emitKeyword(lexeme, top.endScope._wrap);
        } else if (top.endScope && top.endScope._multi) {
          processBuffer();
          emitMultiClass(top.endScope, match);
        } else if (origin.skip) {
          modeBuffer += lexeme;
        } else {
          if (!(origin.returnEnd || origin.excludeEnd)) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (origin.excludeEnd) {
            modeBuffer = lexeme;
          }
        }
        do {
          if (top.scope) {
            emitter.closeNode();
          }
          if (!top.skip && !top.subLanguage) {
            relevance += top.relevance;
          }
          top = top.parent;
        } while (top !== endMode.parent);
        if (endMode.starts) {
          startNewMode(endMode.starts, match);
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }

      function processContinuations() {
        const list = [];
        for (let current = top; current !== language; current = current.parent) {
          if (current.scope) {
            list.unshift(current.scope);
          }
        }
        list.forEach(item => emitter.openNode(item));
      }

      /** @type {{type?: MatchType, index?: number, rule?: Mode}}} */
      let lastMatch = {};

      /**
       *  Process an individual match
       *
       * @param {string} textBeforeMatch - text preceding the match (since the last match)
       * @param {EnhancedMatch} [match] - the match itself
       */
      function processLexeme(textBeforeMatch, match) {
        const lexeme = match && match[0];

        // add non-matched text to the current mode buffer
        modeBuffer += textBeforeMatch;

        if (lexeme == null) {
          processBuffer();
          return 0;
        }

        // we've found a 0 width match and we're stuck, so we need to advance
        // this happens when we have badly behaved rules that have optional matchers to the degree that
        // sometimes they can end up matching nothing at all
        // Ref: https://github.com/highlightjs/highlight.js/issues/2140
        if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
          // spit the "skipped" character that our regex choked on back into the output sequence
          modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
          if (!SAFE_MODE) {
            /** @type {AnnotatedError} */
            const err = new Error(`0 width match regex (${languageName})`);
            err.languageName = languageName;
            err.badRule = lastMatch.rule;
            throw err;
          }
          return 1;
        }
        lastMatch = match;

        if (match.type === "begin") {
          return doBeginMatch(match);
        } else if (match.type === "illegal" && !ignoreIllegals) {
          // illegal match, we do not continue processing
          /** @type {AnnotatedError} */
          const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.scope || '<unnamed>') + '"');
          err.mode = top;
          throw err;
        } else if (match.type === "end") {
          const processed = doEndMatch(match);
          if (processed !== NO_MATCH) {
            return processed;
          }
        }

        // edge case for when illegal matches $ (end of line) which is technically
        // a 0 width match but not a begin/end match so it's not caught by the
        // first handler (when ignoreIllegals is true)
        if (match.type === "illegal" && lexeme === "") {
          // advance so we aren't stuck in an infinite loop
          return 1;
        }

        // infinite loops are BAD, this is a last ditch catch all. if we have a
        // decent number of iterations yet our index (cursor position in our
        // parsing) still 3x behind our index then something is very wrong
        // so we bail
        if (iterations > 100000 && iterations > match.index * 3) {
          const err = new Error('potential infinite loop, way more iterations than matches');
          throw err;
        }

        /*
        Why might be find ourselves here?  An potential end match that was
        triggered but could not be completed.  IE, `doEndMatch` returned NO_MATCH.
        (this could be because a callback requests the match be ignored, etc)

        This causes no real harm other than stopping a few times too many.
        */

        modeBuffer += lexeme;
        return lexeme.length;
      }

      const language = getLanguage(languageName);
      if (!language) {
        error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
        throw new Error('Unknown language: "' + languageName + '"');
      }

      const md = compileLanguage(language);
      let result = '';
      /** @type {CompiledMode} */
      let top = continuation || md;
      /** @type Record<string,CompiledMode> */
      const continuations = {}; // keep continuations for sub-languages
      const emitter = new options.__emitter(options);
      processContinuations();
      let modeBuffer = '';
      let relevance = 0;
      let index = 0;
      let iterations = 0;
      let resumeScanAtSamePosition = false;

      try {
        if (!language.__emitTokens) {
          top.matcher.considerAll();

          for (;;) {
            iterations++;
            if (resumeScanAtSamePosition) {
              // only regexes not matched previously will now be
              // considered for a potential match
              resumeScanAtSamePosition = false;
            } else {
              top.matcher.considerAll();
            }
            top.matcher.lastIndex = index;

            const match = top.matcher.exec(codeToHighlight);
            // console.log("match", match[0], match.rule && match.rule.begin)

            if (!match) break;

            const beforeMatch = codeToHighlight.substring(index, match.index);
            const processedCount = processLexeme(beforeMatch, match);
            index = match.index + processedCount;
          }
          processLexeme(codeToHighlight.substring(index));
        } else {
          language.__emitTokens(codeToHighlight, emitter);
        }

        emitter.finalize();
        result = emitter.toHTML();

        return {
          language: languageName,
          value: result,
          relevance,
          illegal: false,
          _emitter: emitter,
          _top: top
        };
      } catch (err) {
        if (err.message && err.message.includes('Illegal')) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: true,
            relevance: 0,
            _illegalBy: {
              message: err.message,
              index,
              context: codeToHighlight.slice(index - 100, index + 100),
              mode: err.mode,
              resultSoFar: result
            },
            _emitter: emitter
          };
        } else if (SAFE_MODE) {
          return {
            language: languageName,
            value: escape(codeToHighlight),
            illegal: false,
            relevance: 0,
            errorRaised: err,
            _emitter: emitter,
            _top: top
          };
        } else {
          throw err;
        }
      }
    }

    /**
     * returns a valid highlight result, without actually doing any actual work,
     * auto highlight starts with this and it's possible for small snippets that
     * auto-detection may not find a better match
     * @param {string} code
     * @returns {HighlightResult}
     */
    function justTextHighlightResult(code) {
      const result = {
        value: escape(code),
        illegal: false,
        relevance: 0,
        _top: PLAINTEXT_LANGUAGE,
        _emitter: new options.__emitter(options)
      };
      result._emitter.addText(code);
      return result;
    }

    /**
    Highlighting with language detection. Accepts a string with the code to
    highlight. Returns an object with the following properties:

    - language (detected language)
    - relevance (int)
    - value (an HTML string with highlighting markup)
    - secondBest (object with the same structure for second-best heuristically
      detected language, may be absent)

      @param {string} code
      @param {Array<string>} [languageSubset]
      @returns {AutoHighlightResult}
    */
    function highlightAuto(code, languageSubset) {
      languageSubset = languageSubset || options.languages || Object.keys(languages);
      const plaintext = justTextHighlightResult(code);

      const results = languageSubset.filter(getLanguage).filter(autoDetection).map(name =>
        _highlight(name, code, false)
      );
      results.unshift(plaintext); // plaintext is always an option

      const sorted = results.sort((a, b) => {
        // sort base on relevance
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;

        // always award the tie to the base language
        // ie if C++ and Arduino are tied, it's more likely to be C++
        if (a.language && b.language) {
          if (getLanguage(a.language).supersetOf === b.language) {
            return 1;
          } else if (getLanguage(b.language).supersetOf === a.language) {
            return -1;
          }
        }

        // otherwise say they are equal, which has the effect of sorting on
        // relevance while preserving the original ordering - which is how ties
        // have historically been settled, ie the language that comes first always
        // wins in the case of a tie
        return 0;
      });

      const [best, secondBest] = sorted;

      /** @type {AutoHighlightResult} */
      const result = best;
      result.secondBest = secondBest;

      return result;
    }

    /**
     * Builds new class name for block given the language name
     *
     * @param {HTMLElement} element
     * @param {string} [currentLang]
     * @param {string} [resultLang]
     */
    function updateClassName(element, currentLang, resultLang) {
      const language = (currentLang && aliases[currentLang]) || resultLang;

      element.classList.add("hljs");
      element.classList.add(`language-${language}`);
    }

    /**
     * Applies highlighting to a DOM node containing code.
     *
     * @param {HighlightedHTMLElement} element - the HTML element to highlight
    */
    function highlightElement(element) {
      /** @type HTMLElement */
      let node = null;
      const language = blockLanguage(element);

      if (shouldNotHighlight(language)) return;

      fire("before:highlightElement",
        { el: element, language });

      if (element.dataset.highlighted) {
        console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.", element);
        return;
      }

      // we should be all text, no child nodes (unescaped HTML) - this is possibly
      // an HTML injection attack - it's likely too late if this is already in
      // production (the code has likely already done its damage by the time
      // we're seeing it)... but we yell loudly about this so that hopefully it's
      // more likely to be caught in development before making it to production
      if (element.children.length > 0) {
        if (!options.ignoreUnescapedHTML) {
          console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk.");
          console.warn("https://github.com/highlightjs/highlight.js/wiki/security");
          console.warn("The element with unescaped HTML:");
          console.warn(element);
        }
        if (options.throwUnescapedHTML) {
          const err = new HTMLInjectionError(
            "One of your code blocks includes unescaped HTML.",
            element.innerHTML
          );
          throw err;
        }
      }

      node = element;
      const text = node.textContent;
      const result = language ? highlight(text, { language, ignoreIllegals: true }) : highlightAuto(text);

      element.innerHTML = result.value;
      element.dataset.highlighted = "yes";
      updateClassName(element, language, result.language);
      element.result = {
        language: result.language,
        // TODO: remove with version 11.0
        re: result.relevance,
        relevance: result.relevance
      };
      if (result.secondBest) {
        element.secondBest = {
          language: result.secondBest.language,
          relevance: result.secondBest.relevance
        };
      }

      fire("after:highlightElement", { el: element, result, text });
    }

    /**
     * Updates highlight.js global options with the passed options
     *
     * @param {Partial<HLJSOptions>} userOptions
     */
    function configure(userOptions) {
      options = inherit(options, userOptions);
    }

    // TODO: remove v12, deprecated
    const initHighlighting = () => {
      highlightAll();
      deprecated("10.6.0", "initHighlighting() deprecated.  Use highlightAll() now.");
    };

    // TODO: remove v12, deprecated
    function initHighlightingOnLoad() {
      highlightAll();
      deprecated("10.6.0", "initHighlightingOnLoad() deprecated.  Use highlightAll() now.");
    }

    let wantsHighlight = false;

    /**
     * auto-highlights all pre>code elements on the page
     */
    function highlightAll() {
      // if we are called too early in the loading process
      if (document.readyState === "loading") {
        wantsHighlight = true;
        return;
      }

      const blocks = document.querySelectorAll(options.cssSelector);
      blocks.forEach(highlightElement);
    }

    function boot() {
      // if a highlight was requested before DOM was loaded, do now
      if (wantsHighlight) highlightAll();
    }

    // make sure we are in the browser environment
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('DOMContentLoaded', boot, false);
    }

    /**
     * Register a language grammar module
     *
     * @param {string} languageName
     * @param {LanguageFn} languageDefinition
     */
    function registerLanguage(languageName, languageDefinition) {
      let lang = null;
      try {
        lang = languageDefinition(hljs);
      } catch (error$1) {
        error("Language definition for '{}' could not be registered.".replace("{}", languageName));
        // hard or soft error
        if (!SAFE_MODE) { throw error$1; } else { error(error$1); }
        // languages that have serious errors are replaced with essentially a
        // "plaintext" stand-in so that the code blocks will still get normal
        // css classes applied to them - and one bad language won't break the
        // entire highlighter
        lang = PLAINTEXT_LANGUAGE;
      }
      // give it a temporary name if it doesn't have one in the meta-data
      if (!lang.name) lang.name = languageName;
      languages[languageName] = lang;
      lang.rawDefinition = languageDefinition.bind(null, hljs);

      if (lang.aliases) {
        registerAliases(lang.aliases, { languageName });
      }
    }

    /**
     * Remove a language grammar module
     *
     * @param {string} languageName
     */
    function unregisterLanguage(languageName) {
      delete languages[languageName];
      for (const alias of Object.keys(aliases)) {
        if (aliases[alias] === languageName) {
          delete aliases[alias];
        }
      }
    }

    /**
     * @returns {string[]} List of language internal names
     */
    function listLanguages() {
      return Object.keys(languages);
    }

    /**
     * @param {string} name - name of the language to retrieve
     * @returns {Language | undefined}
     */
    function getLanguage(name) {
      name = (name || '').toLowerCase();
      return languages[name] || languages[aliases[name]];
    }

    /**
     *
     * @param {string|string[]} aliasList - single alias or list of aliases
     * @param {{languageName: string}} opts
     */
    function registerAliases(aliasList, { languageName }) {
      if (typeof aliasList === 'string') {
        aliasList = [aliasList];
      }
      aliasList.forEach(alias => { aliases[alias.toLowerCase()] = languageName; });
    }

    /**
     * Determines if a given language has auto-detection enabled
     * @param {string} name - name of the language
     */
    function autoDetection(name) {
      const lang = getLanguage(name);
      return lang && !lang.disableAutodetect;
    }

    /**
     * Upgrades the old highlightBlock plugins to the new
     * highlightElement API
     * @param {HLJSPlugin} plugin
     */
    function upgradePluginAPI(plugin) {
      // TODO: remove with v12
      if (plugin["before:highlightBlock"] && !plugin["before:highlightElement"]) {
        plugin["before:highlightElement"] = (data) => {
          plugin["before:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
      if (plugin["after:highlightBlock"] && !plugin["after:highlightElement"]) {
        plugin["after:highlightElement"] = (data) => {
          plugin["after:highlightBlock"](
            Object.assign({ block: data.el }, data)
          );
        };
      }
    }

    /**
     * @param {HLJSPlugin} plugin
     */
    function addPlugin(plugin) {
      upgradePluginAPI(plugin);
      plugins.push(plugin);
    }

    /**
     * @param {HLJSPlugin} plugin
     */
    function removePlugin(plugin) {
      const index = plugins.indexOf(plugin);
      if (index !== -1) {
        plugins.splice(index, 1);
      }
    }

    /**
     *
     * @param {PluginEvent} event
     * @param {any} args
     */
    function fire(event, args) {
      const cb = event;
      plugins.forEach(function(plugin) {
        if (plugin[cb]) {
          plugin[cb](args);
        }
      });
    }

    /**
     * DEPRECATED
     * @param {HighlightedHTMLElement} el
     */
    function deprecateHighlightBlock(el) {
      deprecated("10.7.0", "highlightBlock will be removed entirely in v12.0");
      deprecated("10.7.0", "Please use highlightElement now.");

      return highlightElement(el);
    }

    /* Interface definition */
    Object.assign(hljs, {
      highlight,
      highlightAuto,
      highlightAll,
      highlightElement,
      // TODO: Remove with v12 API
      highlightBlock: deprecateHighlightBlock,
      configure,
      initHighlighting,
      initHighlightingOnLoad,
      registerLanguage,
      unregisterLanguage,
      listLanguages,
      getLanguage,
      registerAliases,
      autoDetection,
      inherit,
      addPlugin,
      removePlugin
    });

    hljs.debugMode = function() { SAFE_MODE = false; };
    hljs.safeMode = function() { SAFE_MODE = true; };
    hljs.versionString = version;

    hljs.regex = {
      concat: concat,
      lookahead: lookahead,
      either: either,
      optional: optional,
      anyNumberOfTimes: anyNumberOfTimes
    };

    for (const key in MODES) {
      // @ts-ignore
      if (typeof MODES[key] === "object") {
        // @ts-ignore
        deepFreeze(MODES[key]);
      }
    }

    // merge all the modes/regexes into our main object
    Object.assign(hljs, MODES);

    return hljs;
  };

  // Other names for the variable may break build script
  const highlight = HLJS({});

  // returns a new instance of the highlighter to be used for extensions
  // check https://github.com/wooorm/lowlight/issues/47
  highlight.newInstance = () => HLJS({});

  return highlight;

})();
if (typeof exports === 'object' && typeof module !== 'undefined') { module.exports = hljs; }
/*! `accesslog` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: Apache Access Log
   Author: Oleg Efimov <efimovov@gmail.com>
   Description: Apache/Nginx Access Logs
   Website: https://httpd.apache.org/docs/2.4/logs.html#accesslog
   Category: web, logs
   Audit: 2020
   */

  /** @type LanguageFn */
  function accesslog(hljs) {
    const regex = hljs.regex;
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
    const HTTP_VERBS = [
      "GET",
      "POST",
      "HEAD",
      "PUT",
      "DELETE",
      "CONNECT",
      "OPTIONS",
      "PATCH",
      "TRACE"
    ];
    return {
      name: 'Apache Access Log',
      contains: [
        // IP
        {
          className: 'number',
          begin: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?\b/,
          relevance: 5
        },
        // Other numbers
        {
          className: 'number',
          begin: /\b\d+\b/,
          relevance: 0
        },
        // Requests
        {
          className: 'string',
          begin: regex.concat(/"/, regex.either(...HTTP_VERBS)),
          end: /"/,
          keywords: HTTP_VERBS,
          illegal: /\n/,
          relevance: 5,
          contains: [
            {
              begin: /HTTP\/[12]\.\d'/,
              relevance: 5
            }
          ]
        },
        // Dates
        {
          className: 'string',
          // dates must have a certain length, this prevents matching
          // simple array accesses a[123] and [] and other common patterns
          // found in other languages
          begin: /\[\d[^\]\n]{8,}\]/,
          illegal: /\n/,
          relevance: 1
        },
        {
          className: 'string',
          begin: /\[/,
          end: /\]/,
          illegal: /\n/,
          relevance: 0
        },
        // User agent / relevance boost
        {
          className: 'string',
          begin: /"Mozilla\/\d\.\d \(/,
          end: /"/,
          illegal: /\n/,
          relevance: 3
        },
        // Strings
        {
          className: 'string',
          begin: /"/,
          end: /"/,
          illegal: /\n/,
          relevance: 0
        }
      ]
    };
  }

  return accesslog;

})();

    hljs.registerLanguage('accesslog', hljsGrammar);
  })();/*! `apache` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Apache config
  Author: Ruslan Keba <rukeba@gmail.com>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: https://httpd.apache.org
  Description: language definition for Apache configuration files (httpd.conf & .htaccess)
  Category: config, web
  Audit: 2020
  */

  /** @type LanguageFn */
  function apache(hljs) {
    const NUMBER_REF = {
      className: 'number',
      begin: /[$%]\d+/
    };
    const NUMBER = {
      className: 'number',
      begin: /\b\d+/
    };
    const IP_ADDRESS = {
      className: "number",
      begin: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?/
    };
    const PORT_NUMBER = {
      className: "number",
      begin: /:\d{1,5}/
    };
    return {
      name: 'Apache config',
      aliases: [ 'apacheconf' ],
      case_insensitive: true,
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          className: 'section',
          begin: /<\/?/,
          end: />/,
          contains: [
            IP_ADDRESS,
            PORT_NUMBER,
            // low relevance prevents us from claming XML/HTML where this rule would
            // match strings inside of XML tags
            hljs.inherit(hljs.QUOTE_STRING_MODE, { relevance: 0 })
          ]
        },
        {
          className: 'attribute',
          begin: /\w+/,
          relevance: 0,
          // keywords aren’t needed for highlighting per se, they only boost relevance
          // for a very generally defined mode (starts with a word, ends with line-end
          keywords: { _: [
            "order",
            "deny",
            "allow",
            "setenv",
            "rewriterule",
            "rewriteengine",
            "rewritecond",
            "documentroot",
            "sethandler",
            "errordocument",
            "loadmodule",
            "options",
            "header",
            "listen",
            "serverroot",
            "servername"
          ] },
          starts: {
            end: /$/,
            relevance: 0,
            keywords: { literal: 'on off all deny allow' },
            contains: [
              {
                className: 'meta',
                begin: /\s\[/,
                end: /\]$/
              },
              {
                className: 'variable',
                begin: /[\$%]\{/,
                end: /\}/,
                contains: [
                  'self',
                  NUMBER_REF
                ]
              },
              IP_ADDRESS,
              NUMBER,
              hljs.QUOTE_STRING_MODE
            ]
          }
        }
      ],
      illegal: /\S/
    };
  }

  return apache;

})();

    hljs.registerLanguage('apache', hljsGrammar);
  })();/*! `bash` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Bash
  Author: vah <vahtenberg@gmail.com>
  Contributrors: Benjamin Pannell <contact@sierrasoftworks.com>
  Website: https://www.gnu.org/software/bash/
  Category: common, scripting
  */

  /** @type LanguageFn */
  function bash(hljs) {
    const regex = hljs.regex;
    const VAR = {};
    const BRACED_VAR = {
      begin: /\$\{/,
      end: /\}/,
      contains: [
        "self",
        {
          begin: /:-/,
          contains: [ VAR ]
        } // default values
      ]
    };
    Object.assign(VAR, {
      className: 'variable',
      variants: [
        { begin: regex.concat(/\$[\w\d#@][\w\d_]*/,
          // negative look-ahead tries to avoid matching patterns that are not
          // Perl at all like $ident$, @ident@, etc.
          `(?![\\w\\d])(?![$])`) },
        BRACED_VAR
      ]
    });

    const SUBST = {
      className: 'subst',
      begin: /\$\(/,
      end: /\)/,
      contains: [ hljs.BACKSLASH_ESCAPE ]
    };
    const COMMENT = hljs.inherit(
      hljs.COMMENT(),
      {
        match: [
          /(^|\s)/,
          /#.*$/
        ],
        scope: {
          2: 'comment'
        }
      }
    );
    const HERE_DOC = {
      begin: /<<-?\s*(?=\w+)/,
      starts: { contains: [
        hljs.END_SAME_AS_BEGIN({
          begin: /(\w+)/,
          end: /(\w+)/,
          className: 'string'
        })
      ] }
    };
    const QUOTE_STRING = {
      className: 'string',
      begin: /"/,
      end: /"/,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        VAR,
        SUBST
      ]
    };
    SUBST.contains.push(QUOTE_STRING);
    const ESCAPED_QUOTE = {
      match: /\\"/
    };
    const APOS_STRING = {
      className: 'string',
      begin: /'/,
      end: /'/
    };
    const ESCAPED_APOS = {
      match: /\\'/
    };
    const ARITHMETIC = {
      begin: /\$?\(\(/,
      end: /\)\)/,
      contains: [
        {
          begin: /\d+#[0-9a-f]+/,
          className: "number"
        },
        hljs.NUMBER_MODE,
        VAR
      ]
    };
    const SH_LIKE_SHELLS = [
      "fish",
      "bash",
      "zsh",
      "sh",
      "csh",
      "ksh",
      "tcsh",
      "dash",
      "scsh",
    ];
    const KNOWN_SHEBANG = hljs.SHEBANG({
      binary: `(${SH_LIKE_SHELLS.join("|")})`,
      relevance: 10
    });
    const FUNCTION = {
      className: 'function',
      begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
      returnBegin: true,
      contains: [ hljs.inherit(hljs.TITLE_MODE, { begin: /\w[\w\d_]*/ }) ],
      relevance: 0
    };

    const KEYWORDS = [
      "if",
      "then",
      "else",
      "elif",
      "fi",
      "for",
      "while",
      "until",
      "in",
      "do",
      "done",
      "case",
      "esac",
      "function",
      "select"
    ];

    const LITERALS = [
      "true",
      "false"
    ];

    // to consume paths to prevent keyword matches inside them
    const PATH_MODE = { match: /(\/[a-z._-]+)+/ };

    // http://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html
    const SHELL_BUILT_INS = [
      "break",
      "cd",
      "continue",
      "eval",
      "exec",
      "exit",
      "export",
      "getopts",
      "hash",
      "pwd",
      "readonly",
      "return",
      "shift",
      "test",
      "times",
      "trap",
      "umask",
      "unset"
    ];

    const BASH_BUILT_INS = [
      "alias",
      "bind",
      "builtin",
      "caller",
      "command",
      "declare",
      "echo",
      "enable",
      "help",
      "let",
      "local",
      "logout",
      "mapfile",
      "printf",
      "read",
      "readarray",
      "source",
      "type",
      "typeset",
      "ulimit",
      "unalias"
    ];

    const ZSH_BUILT_INS = [
      "autoload",
      "bg",
      "bindkey",
      "bye",
      "cap",
      "chdir",
      "clone",
      "comparguments",
      "compcall",
      "compctl",
      "compdescribe",
      "compfiles",
      "compgroups",
      "compquote",
      "comptags",
      "comptry",
      "compvalues",
      "dirs",
      "disable",
      "disown",
      "echotc",
      "echoti",
      "emulate",
      "fc",
      "fg",
      "float",
      "functions",
      "getcap",
      "getln",
      "history",
      "integer",
      "jobs",
      "kill",
      "limit",
      "log",
      "noglob",
      "popd",
      "print",
      "pushd",
      "pushln",
      "rehash",
      "sched",
      "setcap",
      "setopt",
      "stat",
      "suspend",
      "ttyctl",
      "unfunction",
      "unhash",
      "unlimit",
      "unsetopt",
      "vared",
      "wait",
      "whence",
      "where",
      "which",
      "zcompile",
      "zformat",
      "zftp",
      "zle",
      "zmodload",
      "zparseopts",
      "zprof",
      "zpty",
      "zregexparse",
      "zsocket",
      "zstyle",
      "ztcp"
    ];

    const GNU_CORE_UTILS = [
      "chcon",
      "chgrp",
      "chown",
      "chmod",
      "cp",
      "dd",
      "df",
      "dir",
      "dircolors",
      "ln",
      "ls",
      "mkdir",
      "mkfifo",
      "mknod",
      "mktemp",
      "mv",
      "realpath",
      "rm",
      "rmdir",
      "shred",
      "sync",
      "touch",
      "truncate",
      "vdir",
      "b2sum",
      "base32",
      "base64",
      "cat",
      "cksum",
      "comm",
      "csplit",
      "cut",
      "expand",
      "fmt",
      "fold",
      "head",
      "join",
      "md5sum",
      "nl",
      "numfmt",
      "od",
      "paste",
      "ptx",
      "pr",
      "sha1sum",
      "sha224sum",
      "sha256sum",
      "sha384sum",
      "sha512sum",
      "shuf",
      "sort",
      "split",
      "sum",
      "tac",
      "tail",
      "tr",
      "tsort",
      "unexpand",
      "uniq",
      "wc",
      "arch",
      "basename",
      "chroot",
      "date",
      "dirname",
      "du",
      "echo",
      "env",
      "expr",
      "factor",
      // "false", // keyword literal already
      "groups",
      "hostid",
      "id",
      "link",
      "logname",
      "nice",
      "nohup",
      "nproc",
      "pathchk",
      "pinky",
      "printenv",
      "printf",
      "pwd",
      "readlink",
      "runcon",
      "seq",
      "sleep",
      "stat",
      "stdbuf",
      "stty",
      "tee",
      "test",
      "timeout",
      // "true", // keyword literal already
      "tty",
      "uname",
      "unlink",
      "uptime",
      "users",
      "who",
      "whoami",
      "yes"
    ];

    return {
      name: 'Bash',
      aliases: [ 'sh' ],
      keywords: {
        $pattern: /\b[a-z][a-z0-9._-]+\b/,
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: [
          ...SHELL_BUILT_INS,
          ...BASH_BUILT_INS,
          // Shell modifiers
          "set",
          "shopt",
          ...ZSH_BUILT_INS,
          ...GNU_CORE_UTILS
        ]
      },
      contains: [
        KNOWN_SHEBANG, // to catch known shells and boost relevancy
        hljs.SHEBANG(), // to catch unknown shells but still highlight the shebang
        FUNCTION,
        ARITHMETIC,
        COMMENT,
        HERE_DOC,
        PATH_MODE,
        QUOTE_STRING,
        ESCAPED_QUOTE,
        APOS_STRING,
        ESCAPED_APOS,
        VAR
      ]
    };
  }

  return bash;

})();

    hljs.registerLanguage('bash', hljsGrammar);
  })();/*! `c` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C
  Category: common, system
  Website: https://en.wikipedia.org/wiki/C_(programming_language)
  */

  /** @type LanguageFn */
  function c(hljs) {
    const regex = hljs.regex;
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    const C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', { contains: [ { begin: /\\\n/ } ] });
    const DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    const NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    const TEMPLATE_ARGUMENT_RE = '<[^<>]+>';
    const FUNCTION_TYPE_RE = '('
      + DECLTYPE_AUTO_RE + '|'
      + regex.optional(NAMESPACE_RE)
      + '[a-zA-Z_]\\w*' + regex.optional(TEMPLATE_ARGUMENT_RE)
    + ')';


    const TYPES = {
      className: 'type',
      variants: [
        { begin: '\\b[a-z\\d_]*_t\\b' },
        { match: /\batomic_[a-z]{3,6}\b/ }
      ]

    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    const CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    const STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"',
          end: '"',
          illegal: '\\n',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + "|.)",
          end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/
        })
      ]
    };

    const NUMBERS = {
      className: 'number',
      variants: [
        { begin: '\\b(0b[01\']+)' },
        { begin: '(-?)\\b([\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)((ll|LL|l|L)(u|U)?|(u|U)(ll|LL|l|L)?|f|F|b|B)' },
        { begin: '(-?)(\\b0[xX][a-fA-F0-9\']+|(\\b[\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)([eE][-+]?[\\d\']+)?)' }
      ],
      relevance: 0
    };

    const PREPROCESSOR = {
      className: 'meta',
      begin: /#\s*[a-z]+\b/,
      end: /$/,
      keywords: { keyword:
          'if else elif endif define undef warning error line '
          + 'pragma _Pragma ifdef ifndef include' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        hljs.inherit(STRINGS, { className: 'string' }),
        {
          className: 'string',
          begin: /<.*?>/
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    const TITLE_MODE = {
      className: 'title',
      begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    const C_KEYWORDS = [
      "asm",
      "auto",
      "break",
      "case",
      "continue",
      "default",
      "do",
      "else",
      "enum",
      "extern",
      "for",
      "fortran",
      "goto",
      "if",
      "inline",
      "register",
      "restrict",
      "return",
      "sizeof",
      "struct",
      "switch",
      "typedef",
      "union",
      "volatile",
      "while",
      "_Alignas",
      "_Alignof",
      "_Atomic",
      "_Generic",
      "_Noreturn",
      "_Static_assert",
      "_Thread_local",
      // aliases
      "alignas",
      "alignof",
      "noreturn",
      "static_assert",
      "thread_local",
      // not a C keyword but is, for all intents and purposes, treated exactly like one.
      "_Pragma"
    ];

    const C_TYPES = [
      "float",
      "double",
      "signed",
      "unsigned",
      "int",
      "short",
      "long",
      "char",
      "void",
      "_Bool",
      "_Complex",
      "_Imaginary",
      "_Decimal32",
      "_Decimal64",
      "_Decimal128",
      // modifiers
      "const",
      "static",
      // aliases
      "complex",
      "bool",
      "imaginary"
    ];

    const KEYWORDS = {
      keyword: C_KEYWORDS,
      type: C_TYPES,
      literal: 'true false NULL',
      // TODO: apply hinting work similar to what was done in cpp.js
      built_in: 'std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream '
        + 'auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set '
        + 'unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos '
        + 'asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp '
        + 'fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper '
        + 'isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow '
        + 'printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp '
        + 'strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan '
        + 'vfprintf vprintf vsprintf endl initializer_list unique_ptr',
    };

    const EXPRESSION_CONTAINS = [
      PREPROCESSOR,
      TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    const EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {
          begin: /=/,
          end: /;/
        },
        {
          begin: /\(/,
          end: /\)/
        },
        {
          beginKeywords: 'new throw return else',
          end: /;/
        }
      ],
      keywords: KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat([ 'self' ]),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    const FUNCTION_DECLARATION = {
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true,
      end: /[{;=]/,
      excludeEnd: true,
      keywords: KEYWORDS,
      illegal: /[^\w\s\*&:<>.]/,
      contains: [
        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: KEYWORDS,
          relevance: 0
        },
        {
          begin: FUNCTION_TITLE,
          returnBegin: true,
          contains: [ hljs.inherit(TITLE_MODE, { className: "title.function" }) ],
          relevance: 0
        },
        // allow for multiple declarations, e.g.:
        // extern void f(int), g(char);
        {
          relevance: 0,
          match: /,/
        },
        {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            TYPES,
            // Count matching parentheses.
            {
              begin: /\(/,
              end: /\)/,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                TYPES
              ]
            }
          ]
        },
        TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      name: "C",
      aliases: [ 'h' ],
      keywords: KEYWORDS,
      // Until differentiations are added between `c` and `cpp`, `c` will
      // not be auto-detected to avoid auto-detect conflicts between C and C++
      disableAutodetect: true,
      illegal: '</',
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        EXPRESSION_CONTAINS,
        [
          PREPROCESSOR,
          {
            begin: hljs.IDENT_RE + '::',
            keywords: KEYWORDS
          },
          {
            className: 'class',
            beginKeywords: 'enum class struct union',
            end: /[{;:<>=]/,
            contains: [
              { beginKeywords: "final class struct" },
              hljs.TITLE_MODE
            ]
          }
        ]),
      exports: {
        preprocessor: PREPROCESSOR,
        strings: STRINGS,
        keywords: KEYWORDS
      }
    };
  }

  return c;

})();

    hljs.registerLanguage('c', hljsGrammar);
  })();/*! `cpp` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: C++
  Category: common, system
  Website: https://isocpp.org
  */

  /** @type LanguageFn */
  function cpp(hljs) {
    const regex = hljs.regex;
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    const C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', { contains: [ { begin: /\\\n/ } ] });
    const DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    const NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    const TEMPLATE_ARGUMENT_RE = '<[^<>]+>';
    const FUNCTION_TYPE_RE = '(?!struct)('
      + DECLTYPE_AUTO_RE + '|'
      + regex.optional(NAMESPACE_RE)
      + '[a-zA-Z_]\\w*' + regex.optional(TEMPLATE_ARGUMENT_RE)
    + ')';

    const CPP_PRIMITIVE_TYPES = {
      className: 'type',
      begin: '\\b[a-z\\d_]*_t\\b'
    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    const CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    const STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"',
          end: '"',
          illegal: '\\n',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + '|.)',
          end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/
        })
      ]
    };

    const NUMBERS = {
      className: 'number',
      variants: [
        // Floating-point literal.
        { begin:
          "[+-]?(?:" // Leading sign.
            // Decimal.
            + "(?:"
              +"[0-9](?:'?[0-9])*\\.(?:[0-9](?:'?[0-9])*)?"
              + "|\\.[0-9](?:'?[0-9])*"
            + ")(?:[Ee][+-]?[0-9](?:'?[0-9])*)?"
            + "|[0-9](?:'?[0-9])*[Ee][+-]?[0-9](?:'?[0-9])*"
            // Hexadecimal.
            + "|0[Xx](?:"
              +"[0-9A-Fa-f](?:'?[0-9A-Fa-f])*(?:\\.(?:[0-9A-Fa-f](?:'?[0-9A-Fa-f])*)?)?"
              + "|\\.[0-9A-Fa-f](?:'?[0-9A-Fa-f])*"
            + ")[Pp][+-]?[0-9](?:'?[0-9])*"
          + ")(?:" // Literal suffixes.
            + "[Ff](?:16|32|64|128)?"
            + "|(BF|bf)16"
            + "|[Ll]"
            + "|" // Literal suffix is optional.
          + ")"
        },
        // Integer literal.
        { begin:
          "[+-]?\\b(?:" // Leading sign.
            + "0[Bb][01](?:'?[01])*" // Binary.
            + "|0[Xx][0-9A-Fa-f](?:'?[0-9A-Fa-f])*" // Hexadecimal.
            + "|0(?:'?[0-7])*" // Octal or just a lone zero.
            + "|[1-9](?:'?[0-9])*" // Decimal.
          + ")(?:" // Literal suffixes.
            + "[Uu](?:LL?|ll?)"
            + "|[Uu][Zz]?"
            + "|(?:LL?|ll?)[Uu]?"
            + "|[Zz][Uu]"
            + "|" // Literal suffix is optional.
          + ")"
          // Note: there are user-defined literal suffixes too, but perhaps having the custom suffix not part of the
          // literal highlight actually makes it stand out more.
        }
      ],
      relevance: 0
    };

    const PREPROCESSOR = {
      className: 'meta',
      begin: /#\s*[a-z]+\b/,
      end: /$/,
      keywords: { keyword:
          'if else elif endif define undef warning error line '
          + 'pragma _Pragma ifdef ifndef include' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        hljs.inherit(STRINGS, { className: 'string' }),
        {
          className: 'string',
          begin: /<.*?>/
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    const TITLE_MODE = {
      className: 'title',
      begin: regex.optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    const FUNCTION_TITLE = regex.optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_KEYWORDS = [
      'alignas',
      'alignof',
      'and',
      'and_eq',
      'asm',
      'atomic_cancel',
      'atomic_commit',
      'atomic_noexcept',
      'auto',
      'bitand',
      'bitor',
      'break',
      'case',
      'catch',
      'class',
      'co_await',
      'co_return',
      'co_yield',
      'compl',
      'concept',
      'const_cast|10',
      'consteval',
      'constexpr',
      'constinit',
      'continue',
      'decltype',
      'default',
      'delete',
      'do',
      'dynamic_cast|10',
      'else',
      'enum',
      'explicit',
      'export',
      'extern',
      'false',
      'final',
      'for',
      'friend',
      'goto',
      'if',
      'import',
      'inline',
      'module',
      'mutable',
      'namespace',
      'new',
      'noexcept',
      'not',
      'not_eq',
      'nullptr',
      'operator',
      'or',
      'or_eq',
      'override',
      'private',
      'protected',
      'public',
      'reflexpr',
      'register',
      'reinterpret_cast|10',
      'requires',
      'return',
      'sizeof',
      'static_assert',
      'static_cast|10',
      'struct',
      'switch',
      'synchronized',
      'template',
      'this',
      'thread_local',
      'throw',
      'transaction_safe',
      'transaction_safe_dynamic',
      'true',
      'try',
      'typedef',
      'typeid',
      'typename',
      'union',
      'using',
      'virtual',
      'volatile',
      'while',
      'xor',
      'xor_eq'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const RESERVED_TYPES = [
      'bool',
      'char',
      'char16_t',
      'char32_t',
      'char8_t',
      'double',
      'float',
      'int',
      'long',
      'short',
      'void',
      'wchar_t',
      'unsigned',
      'signed',
      'const',
      'static'
    ];

    const TYPE_HINTS = [
      'any',
      'auto_ptr',
      'barrier',
      'binary_semaphore',
      'bitset',
      'complex',
      'condition_variable',
      'condition_variable_any',
      'counting_semaphore',
      'deque',
      'false_type',
      'future',
      'imaginary',
      'initializer_list',
      'istringstream',
      'jthread',
      'latch',
      'lock_guard',
      'multimap',
      'multiset',
      'mutex',
      'optional',
      'ostringstream',
      'packaged_task',
      'pair',
      'promise',
      'priority_queue',
      'queue',
      'recursive_mutex',
      'recursive_timed_mutex',
      'scoped_lock',
      'set',
      'shared_future',
      'shared_lock',
      'shared_mutex',
      'shared_timed_mutex',
      'shared_ptr',
      'stack',
      'string_view',
      'stringstream',
      'timed_mutex',
      'thread',
      'true_type',
      'tuple',
      'unique_lock',
      'unique_ptr',
      'unordered_map',
      'unordered_multimap',
      'unordered_multiset',
      'unordered_set',
      'variant',
      'vector',
      'weak_ptr',
      'wstring',
      'wstring_view'
    ];

    const FUNCTION_HINTS = [
      'abort',
      'abs',
      'acos',
      'apply',
      'as_const',
      'asin',
      'atan',
      'atan2',
      'calloc',
      'ceil',
      'cerr',
      'cin',
      'clog',
      'cos',
      'cosh',
      'cout',
      'declval',
      'endl',
      'exchange',
      'exit',
      'exp',
      'fabs',
      'floor',
      'fmod',
      'forward',
      'fprintf',
      'fputs',
      'free',
      'frexp',
      'fscanf',
      'future',
      'invoke',
      'isalnum',
      'isalpha',
      'iscntrl',
      'isdigit',
      'isgraph',
      'islower',
      'isprint',
      'ispunct',
      'isspace',
      'isupper',
      'isxdigit',
      'labs',
      'launder',
      'ldexp',
      'log',
      'log10',
      'make_pair',
      'make_shared',
      'make_shared_for_overwrite',
      'make_tuple',
      'make_unique',
      'malloc',
      'memchr',
      'memcmp',
      'memcpy',
      'memset',
      'modf',
      'move',
      'pow',
      'printf',
      'putchar',
      'puts',
      'realloc',
      'scanf',
      'sin',
      'sinh',
      'snprintf',
      'sprintf',
      'sqrt',
      'sscanf',
      'std',
      'stderr',
      'stdin',
      'stdout',
      'strcat',
      'strchr',
      'strcmp',
      'strcpy',
      'strcspn',
      'strlen',
      'strncat',
      'strncmp',
      'strncpy',
      'strpbrk',
      'strrchr',
      'strspn',
      'strstr',
      'swap',
      'tan',
      'tanh',
      'terminate',
      'to_underlying',
      'tolower',
      'toupper',
      'vfprintf',
      'visit',
      'vprintf',
      'vsprintf'
    ];

    const LITERALS = [
      'NULL',
      'false',
      'nullopt',
      'nullptr',
      'true'
    ];

    // https://en.cppreference.com/w/cpp/keyword
    const BUILT_IN = [ '_Pragma' ];

    const CPP_KEYWORDS = {
      type: RESERVED_TYPES,
      keyword: RESERVED_KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_IN,
      _type_hints: TYPE_HINTS
    };

    const FUNCTION_DISPATCH = {
      className: 'function.dispatch',
      relevance: 0,
      keywords: {
        // Only for relevance, not highlighting.
        _hint: FUNCTION_HINTS },
      begin: regex.concat(
        /\b/,
        /(?!decltype)/,
        /(?!if)/,
        /(?!for)/,
        /(?!switch)/,
        /(?!while)/,
        hljs.IDENT_RE,
        regex.lookahead(/(<[^<>]+>|)\s*\(/))
    };

    const EXPRESSION_CONTAINS = [
      FUNCTION_DISPATCH,
      PREPROCESSOR,
      CPP_PRIMITIVE_TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    const EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {
          begin: /=/,
          end: /;/
        },
        {
          begin: /\(/,
          end: /\)/
        },
        {
          beginKeywords: 'new throw return else',
          end: /;/
        }
      ],
      keywords: CPP_KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat([ 'self' ]),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    const FUNCTION_DECLARATION = {
      className: 'function',
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true,
      end: /[{;=]/,
      excludeEnd: true,
      keywords: CPP_KEYWORDS,
      illegal: /[^\w\s\*&:<>.]/,
      contains: [
        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: CPP_KEYWORDS,
          relevance: 0
        },
        {
          begin: FUNCTION_TITLE,
          returnBegin: true,
          contains: [ TITLE_MODE ],
          relevance: 0
        },
        // needed because we do not have look-behind on the below rule
        // to prevent it from grabbing the final : in a :: pair
        {
          begin: /::/,
          relevance: 0
        },
        // initializers
        {
          begin: /:/,
          endsWithParent: true,
          contains: [
            STRINGS,
            NUMBERS
          ]
        },
        // allow for multiple declarations, e.g.:
        // extern void f(int), g(char);
        {
          relevance: 0,
          match: /,/
        },
        {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          keywords: CPP_KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            CPP_PRIMITIVE_TYPES,
            // Count matching parentheses.
            {
              begin: /\(/,
              end: /\)/,
              keywords: CPP_KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                CPP_PRIMITIVE_TYPES
              ]
            }
          ]
        },
        CPP_PRIMITIVE_TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      name: 'C++',
      aliases: [
        'cc',
        'c++',
        'h++',
        'hpp',
        'hh',
        'hxx',
        'cxx'
      ],
      keywords: CPP_KEYWORDS,
      illegal: '</',
      classNameAliases: { 'function.dispatch': 'built_in' },
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        FUNCTION_DISPATCH,
        EXPRESSION_CONTAINS,
        [
          PREPROCESSOR,
          { // containers: ie, `vector <int> rooms (9);`
            begin: '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array|tuple|optional|variant|function)\\s*<(?!<)',
            end: '>',
            keywords: CPP_KEYWORDS,
            contains: [
              'self',
              CPP_PRIMITIVE_TYPES
            ]
          },
          {
            begin: hljs.IDENT_RE + '::',
            keywords: CPP_KEYWORDS
          },
          {
            match: [
              // extra complexity to deal with `enum class` and `enum struct`
              /\b(?:enum(?:\s+(?:class|struct))?|class|struct|union)/,
              /\s+/,
              /\w+/
            ],
            className: {
              1: 'keyword',
              3: 'title.class'
            }
          }
        ])
    };
  }

  return cpp;

})();

    hljs.registerLanguage('cpp', hljsGrammar);
  })();/*! `csp` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: CSP
  Description: Content Security Policy definition highlighting
  Author: Taras <oxdef@oxdef.info>
  Website: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
  Category: web

  vim: ts=2 sw=2 st=2
  */

  /** @type LanguageFn */
  function csp(hljs) {
    const KEYWORDS = [
      "base-uri",
      "child-src",
      "connect-src",
      "default-src",
      "font-src",
      "form-action",
      "frame-ancestors",
      "frame-src",
      "img-src",
      "manifest-src",
      "media-src",
      "object-src",
      "plugin-types",
      "report-uri",
      "sandbox",
      "script-src",
      "style-src",
      "trusted-types",
      "unsafe-hashes",
      "worker-src"
    ];
    return {
      name: 'CSP',
      case_insensitive: false,
      keywords: {
        $pattern: '[a-zA-Z][a-zA-Z0-9_-]*',
        keyword: KEYWORDS
      },
      contains: [
        {
          className: 'string',
          begin: "'",
          end: "'"
        },
        {
          className: 'attribute',
          begin: '^Content',
          end: ':',
          excludeEnd: true
        }
      ]
    };
  }

  return csp;

})();

    hljs.registerLanguage('csp', hljsGrammar);
  })();/*! `css` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'p',
    'q',
    'quote',
    'samp',
    'section',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'animation',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-decoration-break',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'cx',
    'cy',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flow',
    'flood-color',
    'flood-opacity',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-size',
    'font-size-adjust',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-variant',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'inline-size',
    'isolation',
    'kerning',
    'justify-content',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'mask',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'pointer-events',
    'position',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'row-gap',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'speak',
    'speak-as',
    'src', // @font-face
    'tab-size',
    'table-layout',
    'text-anchor',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-style',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-transform',
    'text-underline-position',
    'top',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'unicode-bidi',
    'vector-effect',
    'vertical-align',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index'
  ].sort().reverse();

  /*
  Language: CSS
  Category: common, css, web
  Website: https://developer.mozilla.org/en-US/docs/Web/CSS
  */


  /** @type LanguageFn */
  function css(hljs) {
    const regex = hljs.regex;
    const modes = MODES(hljs);
    const VENDOR_PREFIX = { begin: /-(webkit|moz|ms|o)-(?=[a-z])/ };
    const AT_MODIFIERS = "and or not only";
    const AT_PROPERTY_RE = /@-?\w[\w]*(-\w+)*/; // @-webkit-keyframes
    const IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
    const STRINGS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE
    ];

    return {
      name: 'CSS',
      case_insensitive: true,
      illegal: /[=|'\$]/,
      keywords: { keyframePosition: "from to" },
      classNameAliases: {
        // for visual continuity with `tag {}` and because we
        // don't have a great class for this?
        keyframePosition: "selector-tag" },
      contains: [
        modes.BLOCK_COMMENT,
        VENDOR_PREFIX,
        // to recognize keyframe 40% etc which are outside the scope of our
        // attribute value mode
        modes.CSS_NUMBER_MODE,
        {
          className: 'selector-id',
          begin: /#[A-Za-z0-9_-]+/,
          relevance: 0
        },
        {
          className: 'selector-class',
          begin: '\\.' + IDENT_RE,
          relevance: 0
        },
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-pseudo',
          variants: [
            { begin: ':(' + PSEUDO_CLASSES.join('|') + ')' },
            { begin: ':(:)?(' + PSEUDO_ELEMENTS.join('|') + ')' }
          ]
        },
        // we may actually need this (12/2020)
        // { // pseudo-selector params
        //   begin: /\(/,
        //   end: /\)/,
        //   contains: [ hljs.CSS_NUMBER_MODE ]
        // },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b'
        },
        // attribute values
        {
          begin: /:/,
          end: /[;}{]/,
          contains: [
            modes.BLOCK_COMMENT,
            modes.HEXCOLOR,
            modes.IMPORTANT,
            modes.CSS_NUMBER_MODE,
            ...STRINGS,
            // needed to highlight these as strings and to avoid issues with
            // illegal characters that might be inside urls that would tigger the
            // languages illegal stack
            {
              begin: /(url|data-uri)\(/,
              end: /\)/,
              relevance: 0, // from keywords
              keywords: { built_in: "url data-uri" },
              contains: [
                ...STRINGS,
                {
                  className: "string",
                  // any character other than `)` as in `url()` will be the start
                  // of a string, which ends with `)` (from the parent mode)
                  begin: /[^)]/,
                  endsWithParent: true,
                  excludeEnd: true
                }
              ]
            },
            modes.FUNCTION_DISPATCH
          ]
        },
        {
          begin: regex.lookahead(/@/),
          end: '[{;]',
          relevance: 0,
          illegal: /:/, // break on Less variables @var: ...
          contains: [
            {
              className: 'keyword',
              begin: AT_PROPERTY_RE
            },
            {
              begin: /\s/,
              endsWithParent: true,
              excludeEnd: true,
              relevance: 0,
              keywords: {
                $pattern: /[a-z-]+/,
                keyword: AT_MODIFIERS,
                attribute: MEDIA_FEATURES.join(" ")
              },
              contains: [
                {
                  begin: /[a-z-]+(?=:)/,
                  className: "attribute"
                },
                ...STRINGS,
                modes.CSS_NUMBER_MODE
              ]
            }
          ]
        },
        {
          className: 'selector-tag',
          begin: '\\b(' + TAGS.join('|') + ')\\b'
        }
      ]
    };
  }

  return css;

})();

    hljs.registerLanguage('css', hljsGrammar);
  })();/*! `dns` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: DNS Zone
  Author: Tim Schumacher <tim@datenknoten.me>
  Category: config
  Website: https://en.wikipedia.org/wiki/Zone_file
  */

  /** @type LanguageFn */
  function dns(hljs) {
    const KEYWORDS = [
      "IN",
      "A",
      "AAAA",
      "AFSDB",
      "APL",
      "CAA",
      "CDNSKEY",
      "CDS",
      "CERT",
      "CNAME",
      "DHCID",
      "DLV",
      "DNAME",
      "DNSKEY",
      "DS",
      "HIP",
      "IPSECKEY",
      "KEY",
      "KX",
      "LOC",
      "MX",
      "NAPTR",
      "NS",
      "NSEC",
      "NSEC3",
      "NSEC3PARAM",
      "PTR",
      "RRSIG",
      "RP",
      "SIG",
      "SOA",
      "SRV",
      "SSHFP",
      "TA",
      "TKEY",
      "TLSA",
      "TSIG",
      "TXT"
    ];
    return {
      name: 'DNS Zone',
      aliases: [
        'bind',
        'zone'
      ],
      keywords: KEYWORDS,
      contains: [
        hljs.COMMENT(';', '$', { relevance: 0 }),
        {
          className: 'meta',
          begin: /^\$(TTL|GENERATE|INCLUDE|ORIGIN)\b/
        },
        // IPv6
        {
          className: 'number',
          begin: '((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}))|:)))\\b'
        },
        // IPv4
        {
          className: 'number',
          begin: '((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\b'
        },
        hljs.inherit(hljs.NUMBER_MODE, { begin: /\b\d+[dhwm]?/ })
      ]
    };
  }

  return dns;

})();

    hljs.registerLanguage('dns', hljsGrammar);
  })();/*! `dockerfile` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Dockerfile
  Requires: bash.js
  Author: Alexis Hénaut <alexis@henaut.net>
  Description: language definition for Dockerfile files
  Website: https://docs.docker.com/engine/reference/builder/
  Category: config
  */

  /** @type LanguageFn */
  function dockerfile(hljs) {
    const KEYWORDS = [
      "from",
      "maintainer",
      "expose",
      "env",
      "arg",
      "user",
      "onbuild",
      "stopsignal"
    ];
    return {
      name: 'Dockerfile',
      aliases: [ 'docker' ],
      case_insensitive: true,
      keywords: KEYWORDS,
      contains: [
        hljs.HASH_COMMENT_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        {
          beginKeywords: 'run cmd entrypoint volume add copy workdir label healthcheck shell',
          starts: {
            end: /[^\\]$/,
            subLanguage: 'bash'
          }
        }
      ],
      illegal: '</'
    };
  }

  return dockerfile;

})();

    hljs.registerLanguage('dockerfile', hljsGrammar);
  })();/*! `excel` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Excel formulae
  Author: Victor Zhou <OiCMudkips@users.noreply.github.com>
  Description: Excel formulae
  Website: https://products.office.com/en-us/excel/
  Category: enterprise
  */

  /** @type LanguageFn */
  function excel(hljs) {
    // built-in functions imported from https://web.archive.org/web/20160513042710/https://support.office.com/en-us/article/Excel-functions-alphabetical-b3944572-255d-4efb-bb96-c6d90033e188
    const BUILT_INS = [
      "ABS",
      "ACCRINT",
      "ACCRINTM",
      "ACOS",
      "ACOSH",
      "ACOT",
      "ACOTH",
      "AGGREGATE",
      "ADDRESS",
      "AMORDEGRC",
      "AMORLINC",
      "AND",
      "ARABIC",
      "AREAS",
      "ASC",
      "ASIN",
      "ASINH",
      "ATAN",
      "ATAN2",
      "ATANH",
      "AVEDEV",
      "AVERAGE",
      "AVERAGEA",
      "AVERAGEIF",
      "AVERAGEIFS",
      "BAHTTEXT",
      "BASE",
      "BESSELI",
      "BESSELJ",
      "BESSELK",
      "BESSELY",
      "BETADIST",
      "BETA.DIST",
      "BETAINV",
      "BETA.INV",
      "BIN2DEC",
      "BIN2HEX",
      "BIN2OCT",
      "BINOMDIST",
      "BINOM.DIST",
      "BINOM.DIST.RANGE",
      "BINOM.INV",
      "BITAND",
      "BITLSHIFT",
      "BITOR",
      "BITRSHIFT",
      "BITXOR",
      "CALL",
      "CEILING",
      "CEILING.MATH",
      "CEILING.PRECISE",
      "CELL",
      "CHAR",
      "CHIDIST",
      "CHIINV",
      "CHITEST",
      "CHISQ.DIST",
      "CHISQ.DIST.RT",
      "CHISQ.INV",
      "CHISQ.INV.RT",
      "CHISQ.TEST",
      "CHOOSE",
      "CLEAN",
      "CODE",
      "COLUMN",
      "COLUMNS",
      "COMBIN",
      "COMBINA",
      "COMPLEX",
      "CONCAT",
      "CONCATENATE",
      "CONFIDENCE",
      "CONFIDENCE.NORM",
      "CONFIDENCE.T",
      "CONVERT",
      "CORREL",
      "COS",
      "COSH",
      "COT",
      "COTH",
      "COUNT",
      "COUNTA",
      "COUNTBLANK",
      "COUNTIF",
      "COUNTIFS",
      "COUPDAYBS",
      "COUPDAYS",
      "COUPDAYSNC",
      "COUPNCD",
      "COUPNUM",
      "COUPPCD",
      "COVAR",
      "COVARIANCE.P",
      "COVARIANCE.S",
      "CRITBINOM",
      "CSC",
      "CSCH",
      "CUBEKPIMEMBER",
      "CUBEMEMBER",
      "CUBEMEMBERPROPERTY",
      "CUBERANKEDMEMBER",
      "CUBESET",
      "CUBESETCOUNT",
      "CUBEVALUE",
      "CUMIPMT",
      "CUMPRINC",
      "DATE",
      "DATEDIF",
      "DATEVALUE",
      "DAVERAGE",
      "DAY",
      "DAYS",
      "DAYS360",
      "DB",
      "DBCS",
      "DCOUNT",
      "DCOUNTA",
      "DDB",
      "DEC2BIN",
      "DEC2HEX",
      "DEC2OCT",
      "DECIMAL",
      "DEGREES",
      "DELTA",
      "DEVSQ",
      "DGET",
      "DISC",
      "DMAX",
      "DMIN",
      "DOLLAR",
      "DOLLARDE",
      "DOLLARFR",
      "DPRODUCT",
      "DSTDEV",
      "DSTDEVP",
      "DSUM",
      "DURATION",
      "DVAR",
      "DVARP",
      "EDATE",
      "EFFECT",
      "ENCODEURL",
      "EOMONTH",
      "ERF",
      "ERF.PRECISE",
      "ERFC",
      "ERFC.PRECISE",
      "ERROR.TYPE",
      "EUROCONVERT",
      "EVEN",
      "EXACT",
      "EXP",
      "EXPON.DIST",
      "EXPONDIST",
      "FACT",
      "FACTDOUBLE",
      "FALSE|0",
      "F.DIST",
      "FDIST",
      "F.DIST.RT",
      "FILTERXML",
      "FIND",
      "FINDB",
      "F.INV",
      "F.INV.RT",
      "FINV",
      "FISHER",
      "FISHERINV",
      "FIXED",
      "FLOOR",
      "FLOOR.MATH",
      "FLOOR.PRECISE",
      "FORECAST",
      "FORECAST.ETS",
      "FORECAST.ETS.CONFINT",
      "FORECAST.ETS.SEASONALITY",
      "FORECAST.ETS.STAT",
      "FORECAST.LINEAR",
      "FORMULATEXT",
      "FREQUENCY",
      "F.TEST",
      "FTEST",
      "FV",
      "FVSCHEDULE",
      "GAMMA",
      "GAMMA.DIST",
      "GAMMADIST",
      "GAMMA.INV",
      "GAMMAINV",
      "GAMMALN",
      "GAMMALN.PRECISE",
      "GAUSS",
      "GCD",
      "GEOMEAN",
      "GESTEP",
      "GETPIVOTDATA",
      "GROWTH",
      "HARMEAN",
      "HEX2BIN",
      "HEX2DEC",
      "HEX2OCT",
      "HLOOKUP",
      "HOUR",
      "HYPERLINK",
      "HYPGEOM.DIST",
      "HYPGEOMDIST",
      "IF",
      "IFERROR",
      "IFNA",
      "IFS",
      "IMABS",
      "IMAGINARY",
      "IMARGUMENT",
      "IMCONJUGATE",
      "IMCOS",
      "IMCOSH",
      "IMCOT",
      "IMCSC",
      "IMCSCH",
      "IMDIV",
      "IMEXP",
      "IMLN",
      "IMLOG10",
      "IMLOG2",
      "IMPOWER",
      "IMPRODUCT",
      "IMREAL",
      "IMSEC",
      "IMSECH",
      "IMSIN",
      "IMSINH",
      "IMSQRT",
      "IMSUB",
      "IMSUM",
      "IMTAN",
      "INDEX",
      "INDIRECT",
      "INFO",
      "INT",
      "INTERCEPT",
      "INTRATE",
      "IPMT",
      "IRR",
      "ISBLANK",
      "ISERR",
      "ISERROR",
      "ISEVEN",
      "ISFORMULA",
      "ISLOGICAL",
      "ISNA",
      "ISNONTEXT",
      "ISNUMBER",
      "ISODD",
      "ISREF",
      "ISTEXT",
      "ISO.CEILING",
      "ISOWEEKNUM",
      "ISPMT",
      "JIS",
      "KURT",
      "LARGE",
      "LCM",
      "LEFT",
      "LEFTB",
      "LEN",
      "LENB",
      "LINEST",
      "LN",
      "LOG",
      "LOG10",
      "LOGEST",
      "LOGINV",
      "LOGNORM.DIST",
      "LOGNORMDIST",
      "LOGNORM.INV",
      "LOOKUP",
      "LOWER",
      "MATCH",
      "MAX",
      "MAXA",
      "MAXIFS",
      "MDETERM",
      "MDURATION",
      "MEDIAN",
      "MID",
      "MIDBs",
      "MIN",
      "MINIFS",
      "MINA",
      "MINUTE",
      "MINVERSE",
      "MIRR",
      "MMULT",
      "MOD",
      "MODE",
      "MODE.MULT",
      "MODE.SNGL",
      "MONTH",
      "MROUND",
      "MULTINOMIAL",
      "MUNIT",
      "N",
      "NA",
      "NEGBINOM.DIST",
      "NEGBINOMDIST",
      "NETWORKDAYS",
      "NETWORKDAYS.INTL",
      "NOMINAL",
      "NORM.DIST",
      "NORMDIST",
      "NORMINV",
      "NORM.INV",
      "NORM.S.DIST",
      "NORMSDIST",
      "NORM.S.INV",
      "NORMSINV",
      "NOT",
      "NOW",
      "NPER",
      "NPV",
      "NUMBERVALUE",
      "OCT2BIN",
      "OCT2DEC",
      "OCT2HEX",
      "ODD",
      "ODDFPRICE",
      "ODDFYIELD",
      "ODDLPRICE",
      "ODDLYIELD",
      "OFFSET",
      "OR",
      "PDURATION",
      "PEARSON",
      "PERCENTILE.EXC",
      "PERCENTILE.INC",
      "PERCENTILE",
      "PERCENTRANK.EXC",
      "PERCENTRANK.INC",
      "PERCENTRANK",
      "PERMUT",
      "PERMUTATIONA",
      "PHI",
      "PHONETIC",
      "PI",
      "PMT",
      "POISSON.DIST",
      "POISSON",
      "POWER",
      "PPMT",
      "PRICE",
      "PRICEDISC",
      "PRICEMAT",
      "PROB",
      "PRODUCT",
      "PROPER",
      "PV",
      "QUARTILE",
      "QUARTILE.EXC",
      "QUARTILE.INC",
      "QUOTIENT",
      "RADIANS",
      "RAND",
      "RANDBETWEEN",
      "RANK.AVG",
      "RANK.EQ",
      "RANK",
      "RATE",
      "RECEIVED",
      "REGISTER.ID",
      "REPLACE",
      "REPLACEB",
      "REPT",
      "RIGHT",
      "RIGHTB",
      "ROMAN",
      "ROUND",
      "ROUNDDOWN",
      "ROUNDUP",
      "ROW",
      "ROWS",
      "RRI",
      "RSQ",
      "RTD",
      "SEARCH",
      "SEARCHB",
      "SEC",
      "SECH",
      "SECOND",
      "SERIESSUM",
      "SHEET",
      "SHEETS",
      "SIGN",
      "SIN",
      "SINH",
      "SKEW",
      "SKEW.P",
      "SLN",
      "SLOPE",
      "SMALL",
      "SQL.REQUEST",
      "SQRT",
      "SQRTPI",
      "STANDARDIZE",
      "STDEV",
      "STDEV.P",
      "STDEV.S",
      "STDEVA",
      "STDEVP",
      "STDEVPA",
      "STEYX",
      "SUBSTITUTE",
      "SUBTOTAL",
      "SUM",
      "SUMIF",
      "SUMIFS",
      "SUMPRODUCT",
      "SUMSQ",
      "SUMX2MY2",
      "SUMX2PY2",
      "SUMXMY2",
      "SWITCH",
      "SYD",
      "T",
      "TAN",
      "TANH",
      "TBILLEQ",
      "TBILLPRICE",
      "TBILLYIELD",
      "T.DIST",
      "T.DIST.2T",
      "T.DIST.RT",
      "TDIST",
      "TEXT",
      "TEXTJOIN",
      "TIME",
      "TIMEVALUE",
      "T.INV",
      "T.INV.2T",
      "TINV",
      "TODAY",
      "TRANSPOSE",
      "TREND",
      "TRIM",
      "TRIMMEAN",
      "TRUE|0",
      "TRUNC",
      "T.TEST",
      "TTEST",
      "TYPE",
      "UNICHAR",
      "UNICODE",
      "UPPER",
      "VALUE",
      "VAR",
      "VAR.P",
      "VAR.S",
      "VARA",
      "VARP",
      "VARPA",
      "VDB",
      "VLOOKUP",
      "WEBSERVICE",
      "WEEKDAY",
      "WEEKNUM",
      "WEIBULL",
      "WEIBULL.DIST",
      "WORKDAY",
      "WORKDAY.INTL",
      "XIRR",
      "XNPV",
      "XOR",
      "YEAR",
      "YEARFRAC",
      "YIELD",
      "YIELDDISC",
      "YIELDMAT",
      "Z.TEST",
      "ZTEST"
    ];
    return {
      name: 'Excel formulae',
      aliases: [
        'xlsx',
        'xls'
      ],
      case_insensitive: true,
      keywords: {
        $pattern: /[a-zA-Z][\w\.]*/,
        built_in: BUILT_INS
      },
      contains: [
        {
          /* matches a beginning equal sign found in Excel formula examples */
          begin: /^=/,
          end: /[^=]/,
          returnEnd: true,
          illegal: /=/, /* only allow single equal sign at front of line */
          relevance: 10
        },
        /* technically, there can be more than 2 letters in column names, but this prevents conflict with some keywords */
        {
          /* matches a reference to a single cell */
          className: 'symbol',
          begin: /\b[A-Z]{1,2}\d+\b/,
          end: /[^\d]/,
          excludeEnd: true,
          relevance: 0
        },
        {
          /* matches a reference to a range of cells */
          className: 'symbol',
          begin: /[A-Z]{0,2}\d*:[A-Z]{0,2}\d*/,
          relevance: 0
        },
        hljs.BACKSLASH_ESCAPE,
        hljs.QUOTE_STRING_MODE,
        {
          className: 'number',
          begin: hljs.NUMBER_RE + '(%)?',
          relevance: 0
        },
        /* Excel formula comments are done by putting the comment in a function call to N() */
        hljs.COMMENT(/\bN\(/, /\)/,
          {
            excludeBegin: true,
            excludeEnd: true,
            illegal: /\n/
          })
      ]
    };
  }

  return excel;

})();

    hljs.registerLanguage('excel', hljsGrammar);
  })();/*! `gauss` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: GAUSS
  Author: Matt Evans <matt@aptech.com>
  Description: GAUSS Mathematical and Statistical language
  Website: https://www.aptech.com
  Category: scientific
  */
  function gauss(hljs) {
    const KEYWORDS = {
      keyword: 'bool break call callexe checkinterrupt clear clearg closeall cls comlog compile '
                + 'continue create debug declare delete disable dlibrary dllcall do dos ed edit else '
                + 'elseif enable end endfor endif endp endo errorlog errorlogat expr external fn '
                + 'for format goto gosub graph if keyword let lib library line load loadarray loadexe '
                + 'loadf loadk loadm loadp loads loadx local locate loopnextindex lprint lpwidth lshow '
                + 'matrix msym ndpclex new open output outwidth plot plotsym pop prcsn print '
                + 'printdos proc push retp return rndcon rndmod rndmult rndseed run save saveall screen '
                + 'scroll setarray show sparse stop string struct system trace trap threadfor '
                + 'threadendfor threadbegin threadjoin threadstat threadend until use while winprint '
                + 'ne ge le gt lt and xor or not eq eqv',
      built_in: 'abs acf aconcat aeye amax amean AmericanBinomCall AmericanBinomCall_Greeks AmericanBinomCall_ImpVol '
                + 'AmericanBinomPut AmericanBinomPut_Greeks AmericanBinomPut_ImpVol AmericanBSCall AmericanBSCall_Greeks '
                + 'AmericanBSCall_ImpVol AmericanBSPut AmericanBSPut_Greeks AmericanBSPut_ImpVol amin amult annotationGetDefaults '
                + 'annotationSetBkd annotationSetFont annotationSetLineColor annotationSetLineStyle annotationSetLineThickness '
                + 'annualTradingDays arccos arcsin areshape arrayalloc arrayindex arrayinit arraytomat asciiload asclabel astd '
                + 'astds asum atan atan2 atranspose axmargin balance band bandchol bandcholsol bandltsol bandrv bandsolpd bar '
                + 'base10 begwind besselj bessely beta box boxcox cdfBeta cdfBetaInv cdfBinomial cdfBinomialInv cdfBvn cdfBvn2 '
                + 'cdfBvn2e cdfCauchy cdfCauchyInv cdfChic cdfChii cdfChinc cdfChincInv cdfExp cdfExpInv cdfFc cdfFnc cdfFncInv '
                + 'cdfGam cdfGenPareto cdfHyperGeo cdfLaplace cdfLaplaceInv cdfLogistic cdfLogisticInv cdfmControlCreate cdfMvn '
                + 'cdfMvn2e cdfMvnce cdfMvne cdfMvt2e cdfMvtce cdfMvte cdfN cdfN2 cdfNc cdfNegBinomial cdfNegBinomialInv cdfNi '
                + 'cdfPoisson cdfPoissonInv cdfRayleigh cdfRayleighInv cdfTc cdfTci cdfTnc cdfTvn cdfWeibull cdfWeibullInv cdir '
                + 'ceil ChangeDir chdir chiBarSquare chol choldn cholsol cholup chrs close code cols colsf combinate combinated '
                + 'complex con cond conj cons ConScore contour conv convertsatostr convertstrtosa corrm corrms corrvc corrx corrxs '
                + 'cos cosh counts countwts crossprd crout croutp csrcol csrlin csvReadM csvReadSA cumprodc cumsumc curve cvtos '
                + 'datacreate datacreatecomplex datalist dataload dataloop dataopen datasave date datestr datestring datestrymd '
                + 'dayinyr dayofweek dbAddDatabase dbClose dbCommit dbCreateQuery dbExecQuery dbGetConnectOptions dbGetDatabaseName '
                + 'dbGetDriverName dbGetDrivers dbGetHostName dbGetLastErrorNum dbGetLastErrorText dbGetNumericalPrecPolicy '
                + 'dbGetPassword dbGetPort dbGetTableHeaders dbGetTables dbGetUserName dbHasFeature dbIsDriverAvailable dbIsOpen '
                + 'dbIsOpenError dbOpen dbQueryBindValue dbQueryClear dbQueryCols dbQueryExecPrepared dbQueryFetchAllM dbQueryFetchAllSA '
                + 'dbQueryFetchOneM dbQueryFetchOneSA dbQueryFinish dbQueryGetBoundValue dbQueryGetBoundValues dbQueryGetField '
                + 'dbQueryGetLastErrorNum dbQueryGetLastErrorText dbQueryGetLastInsertID dbQueryGetLastQuery dbQueryGetPosition '
                + 'dbQueryIsActive dbQueryIsForwardOnly dbQueryIsNull dbQueryIsSelect dbQueryIsValid dbQueryPrepare dbQueryRows '
                + 'dbQuerySeek dbQuerySeekFirst dbQuerySeekLast dbQuerySeekNext dbQuerySeekPrevious dbQuerySetForwardOnly '
                + 'dbRemoveDatabase dbRollback dbSetConnectOptions dbSetDatabaseName dbSetHostName dbSetNumericalPrecPolicy '
                + 'dbSetPort dbSetUserName dbTransaction DeleteFile delif delrows denseToSp denseToSpRE denToZero design det detl '
                + 'dfft dffti diag diagrv digamma doswin DOSWinCloseall DOSWinOpen dotfeq dotfeqmt dotfge dotfgemt dotfgt dotfgtmt '
                + 'dotfle dotflemt dotflt dotfltmt dotfne dotfnemt draw drop dsCreate dstat dstatmt dstatmtControlCreate dtdate dtday '
                + 'dttime dttodtv dttostr dttoutc dtvnormal dtvtodt dtvtoutc dummy dummybr dummydn eig eigh eighv eigv elapsedTradingDays '
                + 'endwind envget eof eqSolve eqSolvemt eqSolvemtControlCreate eqSolvemtOutCreate eqSolveset erf erfc erfccplx erfcplx error '
                + 'etdays ethsec etstr EuropeanBinomCall EuropeanBinomCall_Greeks EuropeanBinomCall_ImpVol EuropeanBinomPut '
                + 'EuropeanBinomPut_Greeks EuropeanBinomPut_ImpVol EuropeanBSCall EuropeanBSCall_Greeks EuropeanBSCall_ImpVol '
                + 'EuropeanBSPut EuropeanBSPut_Greeks EuropeanBSPut_ImpVol exctsmpl exec execbg exp extern eye fcheckerr fclearerr feq '
                + 'feqmt fflush fft ffti fftm fftmi fftn fge fgemt fgets fgetsa fgetsat fgetst fgt fgtmt fileinfo filesa fle flemt '
                + 'floor flt fltmt fmod fne fnemt fonts fopen formatcv formatnv fputs fputst fseek fstrerror ftell ftocv ftos ftostrC '
                + 'gamma gammacplx gammaii gausset gdaAppend gdaCreate gdaDStat gdaDStatMat gdaGetIndex gdaGetName gdaGetNames gdaGetOrders '
                + 'gdaGetType gdaGetTypes gdaGetVarInfo gdaIsCplx gdaLoad gdaPack gdaRead gdaReadByIndex gdaReadSome gdaReadSparse '
                + 'gdaReadStruct gdaReportVarInfo gdaSave gdaUpdate gdaUpdateAndPack gdaVars gdaWrite gdaWrite32 gdaWriteSome getarray '
                + 'getdims getf getGAUSShome getmatrix getmatrix4D getname getnamef getNextTradingDay getNextWeekDay getnr getorders '
                + 'getpath getPreviousTradingDay getPreviousWeekDay getRow getscalar3D getscalar4D getTrRow getwind glm gradcplx gradMT '
                + 'gradMTm gradMTT gradMTTm gradp graphprt graphset hasimag header headermt hess hessMT hessMTg hessMTgw hessMTm '
                + 'hessMTmw hessMTT hessMTTg hessMTTgw hessMTTm hessMTw hessp hist histf histp hsec imag indcv indexcat indices indices2 '
                + 'indicesf indicesfn indnv indsav integrate1d integrateControlCreate intgrat2 intgrat3 inthp1 inthp2 inthp3 inthp4 '
                + 'inthpControlCreate intquad1 intquad2 intquad3 intrleav intrleavsa intrsect intsimp inv invpd invswp iscplx iscplxf '
                + 'isden isinfnanmiss ismiss key keyav keyw lag lag1 lagn lapEighb lapEighi lapEighvb lapEighvi lapgEig lapgEigh lapgEighv '
                + 'lapgEigv lapgSchur lapgSvdcst lapgSvds lapgSvdst lapSvdcusv lapSvds lapSvdusv ldlp ldlsol linSolve listwise ln lncdfbvn '
                + 'lncdfbvn2 lncdfmvn lncdfn lncdfn2 lncdfnc lnfact lngammacplx lnpdfmvn lnpdfmvt lnpdfn lnpdft loadd loadstruct loadwind '
                + 'loess loessmt loessmtControlCreate log loglog logx logy lower lowmat lowmat1 ltrisol lu lusol machEpsilon make makevars '
                + 'makewind margin matalloc matinit mattoarray maxbytes maxc maxindc maxv maxvec mbesselei mbesselei0 mbesselei1 mbesseli '
                + 'mbesseli0 mbesseli1 meanc median mergeby mergevar minc minindc minv miss missex missrv moment momentd movingave '
                + 'movingaveExpwgt movingaveWgt nextindex nextn nextnevn nextwind ntos null null1 numCombinations ols olsmt olsmtControlCreate '
                + 'olsqr olsqr2 olsqrmt ones optn optnevn orth outtyp pacf packedToSp packr parse pause pdfCauchy pdfChi pdfExp pdfGenPareto '
                + 'pdfHyperGeo pdfLaplace pdfLogistic pdfn pdfPoisson pdfRayleigh pdfWeibull pi pinv pinvmt plotAddArrow plotAddBar plotAddBox '
                + 'plotAddHist plotAddHistF plotAddHistP plotAddPolar plotAddScatter plotAddShape plotAddTextbox plotAddTS plotAddXY plotArea '
                + 'plotBar plotBox plotClearLayout plotContour plotCustomLayout plotGetDefaults plotHist plotHistF plotHistP plotLayout '
                + 'plotLogLog plotLogX plotLogY plotOpenWindow plotPolar plotSave plotScatter plotSetAxesPen plotSetBar plotSetBarFill '
                + 'plotSetBarStacked plotSetBkdColor plotSetFill plotSetGrid plotSetLegend plotSetLineColor plotSetLineStyle plotSetLineSymbol '
                + 'plotSetLineThickness plotSetNewWindow plotSetTitle plotSetWhichYAxis plotSetXAxisShow plotSetXLabel plotSetXRange '
                + 'plotSetXTicInterval plotSetXTicLabel plotSetYAxisShow plotSetYLabel plotSetYRange plotSetZAxisShow plotSetZLabel '
                + 'plotSurface plotTS plotXY polar polychar polyeval polygamma polyint polymake polymat polymroot polymult polyroot '
                + 'pqgwin previousindex princomp printfm printfmt prodc psi putarray putf putvals pvCreate pvGetIndex pvGetParNames '
                + 'pvGetParVector pvLength pvList pvPack pvPacki pvPackm pvPackmi pvPacks pvPacksi pvPacksm pvPacksmi pvPutParVector '
                + 'pvTest pvUnpack QNewton QNewtonmt QNewtonmtControlCreate QNewtonmtOutCreate QNewtonSet QProg QProgmt QProgmtInCreate '
                + 'qqr qqre qqrep qr qre qrep qrsol qrtsol qtyr qtyre qtyrep quantile quantiled qyr qyre qyrep qz rank rankindx readr '
                + 'real reclassify reclassifyCuts recode recserar recsercp recserrc rerun rescale reshape rets rev rfft rffti rfftip rfftn '
                + 'rfftnp rfftp rndBernoulli rndBeta rndBinomial rndCauchy rndChiSquare rndCon rndCreateState rndExp rndGamma rndGeo rndGumbel '
                + 'rndHyperGeo rndi rndKMbeta rndKMgam rndKMi rndKMn rndKMnb rndKMp rndKMu rndKMvm rndLaplace rndLCbeta rndLCgam rndLCi rndLCn '
                + 'rndLCnb rndLCp rndLCu rndLCvm rndLogNorm rndMTu rndMVn rndMVt rndn rndnb rndNegBinomial rndp rndPoisson rndRayleigh '
                + 'rndStateSkip rndu rndvm rndWeibull rndWishart rotater round rows rowsf rref sampleData satostrC saved saveStruct savewind '
                + 'scale scale3d scalerr scalinfnanmiss scalmiss schtoc schur searchsourcepath seekr select selif seqa seqm setdif setdifsa '
                + 'setvars setvwrmode setwind shell shiftr sin singleindex sinh sleep solpd sortc sortcc sortd sorthc sorthcc sortind '
                + 'sortindc sortmc sortr sortrc spBiconjGradSol spChol spConjGradSol spCreate spDenseSubmat spDiagRvMat spEigv spEye spLDL '
                + 'spline spLU spNumNZE spOnes spreadSheetReadM spreadSheetReadSA spreadSheetWrite spScale spSubmat spToDense spTrTDense '
                + 'spTScalar spZeros sqpSolve sqpSolveMT sqpSolveMTControlCreate sqpSolveMTlagrangeCreate sqpSolveMToutCreate sqpSolveSet '
                + 'sqrt statements stdc stdsc stocv stof strcombine strindx strlen strput strrindx strsect strsplit strsplitPad strtodt '
                + 'strtof strtofcplx strtriml strtrimr strtrunc strtruncl strtruncpad strtruncr submat subscat substute subvec sumc sumr '
                + 'surface svd svd1 svd2 svdcusv svds svdusv sysstate tab tan tanh tempname '
                + 'time timedt timestr timeutc title tkf2eps tkf2ps tocart todaydt toeplitz token topolar trapchk '
                + 'trigamma trimr trunc type typecv typef union unionsa uniqindx uniqindxsa unique uniquesa upmat upmat1 upper utctodt '
                + 'utctodtv utrisol vals varCovMS varCovXS varget vargetl varmall varmares varput varputl vartypef vcm vcms vcx vcxs '
                + 'vec vech vecr vector vget view viewxyz vlist vnamecv volume vput vread vtypecv wait waitc walkindex where window '
                + 'writer xlabel xlsGetSheetCount xlsGetSheetSize xlsGetSheetTypes xlsMakeRange xlsReadM xlsReadSA xlsWrite xlsWriteM '
                + 'xlsWriteSA xpnd xtics xy xyz ylabel ytics zeros zeta zlabel ztics cdfEmpirical dot h5create h5open h5read h5readAttribute '
                + 'h5write h5writeAttribute ldl plotAddErrorBar plotAddSurface plotCDFEmpirical plotSetColormap plotSetContourLabels '
                + 'plotSetLegendFont plotSetTextInterpreter plotSetXTicCount plotSetYTicCount plotSetZLevels powerm strjoin sylvester '
                + 'strtrim',
      literal: 'DB_AFTER_LAST_ROW DB_ALL_TABLES DB_BATCH_OPERATIONS DB_BEFORE_FIRST_ROW DB_BLOB DB_EVENT_NOTIFICATIONS '
               + 'DB_FINISH_QUERY DB_HIGH_PRECISION DB_LAST_INSERT_ID DB_LOW_PRECISION_DOUBLE DB_LOW_PRECISION_INT32 '
               + 'DB_LOW_PRECISION_INT64 DB_LOW_PRECISION_NUMBERS DB_MULTIPLE_RESULT_SETS DB_NAMED_PLACEHOLDERS '
               + 'DB_POSITIONAL_PLACEHOLDERS DB_PREPARED_QUERIES DB_QUERY_SIZE DB_SIMPLE_LOCKING DB_SYSTEM_TABLES DB_TABLES '
               + 'DB_TRANSACTIONS DB_UNICODE DB_VIEWS __STDIN __STDOUT __STDERR __FILE_DIR'
    };

    const AT_COMMENT_MODE = hljs.COMMENT('@', '@');

    const PREPROCESSOR =
    {
      className: 'meta',
      begin: '#',
      end: '$',
      keywords: { keyword: 'define definecs|10 undef ifdef ifndef iflight ifdllcall ifmac ifos2win ifunix else endif lineson linesoff srcfile srcline' },
      contains: [
        {
          begin: /\\\n/,
          relevance: 0
        },
        {
          beginKeywords: 'include',
          end: '$',
          keywords: { keyword: 'include' },
          contains: [
            {
              className: 'string',
              begin: '"',
              end: '"',
              illegal: '\\n'
            }
          ]
        },
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        AT_COMMENT_MODE
      ]
    };

    const STRUCT_TYPE =
    {
      begin: /\bstruct\s+/,
      end: /\s/,
      keywords: "struct",
      contains: [
        {
          className: "type",
          begin: hljs.UNDERSCORE_IDENT_RE,
          relevance: 0
        }
      ]
    };

    // only for definitions
    const PARSE_PARAMS = [
      {
        className: 'params',
        begin: /\(/,
        end: /\)/,
        excludeBegin: true,
        excludeEnd: true,
        endsWithParent: true,
        relevance: 0,
        contains: [
          { // dots
            className: 'literal',
            begin: /\.\.\./
          },
          hljs.C_NUMBER_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          AT_COMMENT_MODE,
          STRUCT_TYPE
        ]
      }
    ];

    const FUNCTION_DEF =
    {
      className: "title",
      begin: hljs.UNDERSCORE_IDENT_RE,
      relevance: 0
    };

    const DEFINITION = function(beginKeywords, end, inherits) {
      const mode = hljs.inherit(
        {
          className: "function",
          beginKeywords: beginKeywords,
          end: end,
          excludeEnd: true,
          contains: [].concat(PARSE_PARAMS)
        },
        inherits || {}
      );
      mode.contains.push(FUNCTION_DEF);
      mode.contains.push(hljs.C_NUMBER_MODE);
      mode.contains.push(hljs.C_BLOCK_COMMENT_MODE);
      mode.contains.push(AT_COMMENT_MODE);
      return mode;
    };

    const BUILT_IN_REF =
    { // these are explicitly named internal function calls
      className: 'built_in',
      begin: '\\b(' + KEYWORDS.built_in.split(' ').join('|') + ')\\b'
    };

    const STRING_REF =
    {
      className: 'string',
      begin: '"',
      end: '"',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      relevance: 0
    };

    const FUNCTION_REF =
    {
      // className: "fn_ref",
      begin: hljs.UNDERSCORE_IDENT_RE + '\\s*\\(',
      returnBegin: true,
      keywords: KEYWORDS,
      relevance: 0,
      contains: [
        { beginKeywords: KEYWORDS.keyword },
        BUILT_IN_REF,
        { // ambiguously named function calls get a relevance of 0
          className: 'built_in',
          begin: hljs.UNDERSCORE_IDENT_RE,
          relevance: 0
        }
      ]
    };

    const FUNCTION_REF_PARAMS =
    {
      // className: "fn_ref_params",
      begin: /\(/,
      end: /\)/,
      relevance: 0,
      keywords: {
        built_in: KEYWORDS.built_in,
        literal: KEYWORDS.literal
      },
      contains: [
        hljs.C_NUMBER_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        AT_COMMENT_MODE,
        BUILT_IN_REF,
        FUNCTION_REF,
        STRING_REF,
        'self'
      ]
    };

    FUNCTION_REF.contains.push(FUNCTION_REF_PARAMS);

    return {
      name: 'GAUSS',
      aliases: [ 'gss' ],
      case_insensitive: true, // language is case-insensitive
      keywords: KEYWORDS,
      illegal: /(\{[%#]|[%#]\}| <- )/,
      contains: [
        hljs.C_NUMBER_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        AT_COMMENT_MODE,
        STRING_REF,
        PREPROCESSOR,
        {
          className: 'keyword',
          begin: /\bexternal (matrix|string|array|sparse matrix|struct|proc|keyword|fn)/
        },
        DEFINITION('proc keyword', ';'),
        DEFINITION('fn', '='),
        {
          beginKeywords: 'for threadfor',
          end: /;/,
          // end: /\(/,
          relevance: 0,
          contains: [
            hljs.C_BLOCK_COMMENT_MODE,
            AT_COMMENT_MODE,
            FUNCTION_REF_PARAMS
          ]
        },
        { // custom method guard
          // excludes method names from keyword processing
          variants: [
            { begin: hljs.UNDERSCORE_IDENT_RE + '\\.' + hljs.UNDERSCORE_IDENT_RE },
            { begin: hljs.UNDERSCORE_IDENT_RE + '\\s*=' }
          ],
          relevance: 0
        },
        FUNCTION_REF,
        STRUCT_TYPE
      ]
    };
  }

  return gauss;

})();

    hljs.registerLanguage('gauss', hljsGrammar);
  })();/*! `go` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Go
  Author: Stephan Kountso aka StepLg <steplg@gmail.com>
  Contributors: Evgeny Stepanischev <imbolk@gmail.com>
  Description: Google go language (golang). For info about language
  Website: http://golang.org/
  Category: common, system
  */

  function go(hljs) {
    const LITERALS = [
      "true",
      "false",
      "iota",
      "nil"
    ];
    const BUILT_INS = [
      "append",
      "cap",
      "close",
      "complex",
      "copy",
      "imag",
      "len",
      "make",
      "new",
      "panic",
      "print",
      "println",
      "real",
      "recover",
      "delete"
    ];
    const TYPES = [
      "bool",
      "byte",
      "complex64",
      "complex128",
      "error",
      "float32",
      "float64",
      "int8",
      "int16",
      "int32",
      "int64",
      "string",
      "uint8",
      "uint16",
      "uint32",
      "uint64",
      "int",
      "uint",
      "uintptr",
      "rune"
    ];
    const KWS = [
      "break",
      "case",
      "chan",
      "const",
      "continue",
      "default",
      "defer",
      "else",
      "fallthrough",
      "for",
      "func",
      "go",
      "goto",
      "if",
      "import",
      "interface",
      "map",
      "package",
      "range",
      "return",
      "select",
      "struct",
      "switch",
      "type",
      "var",
    ];
    const KEYWORDS = {
      keyword: KWS,
      type: TYPES,
      literal: LITERALS,
      built_in: BUILT_INS
    };
    return {
      name: 'Go',
      aliases: [ 'golang' ],
      keywords: KEYWORDS,
      illegal: '</',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'string',
          variants: [
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            {
              begin: '`',
              end: '`'
            }
          ]
        },
        {
          className: 'number',
          variants: [
            {
              begin: hljs.C_NUMBER_RE + '[i]',
              relevance: 1
            },
            hljs.C_NUMBER_MODE
          ]
        },
        { begin: /:=/ // relevance booster
        },
        {
          className: 'function',
          beginKeywords: 'func',
          end: '\\s*(\\{|$)',
          excludeEnd: true,
          contains: [
            hljs.TITLE_MODE,
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              endsParent: true,
              keywords: KEYWORDS,
              illegal: /["']/
            }
          ]
        }
      ]
    };
  }

  return go;

})();

    hljs.registerLanguage('go', hljsGrammar);
  })();/*! `graphql` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: GraphQL
   Author: John Foster (GH jf990), and others
   Description: GraphQL is a query language for APIs
   Category: web, common
  */

  /** @type LanguageFn */
  function graphql(hljs) {
    const regex = hljs.regex;
    const GQL_NAME = /[_A-Za-z][_0-9A-Za-z]*/;
    return {
      name: "GraphQL",
      aliases: [ "gql" ],
      case_insensitive: true,
      disableAutodetect: false,
      keywords: {
        keyword: [
          "query",
          "mutation",
          "subscription",
          "type",
          "input",
          "schema",
          "directive",
          "interface",
          "union",
          "scalar",
          "fragment",
          "enum",
          "on"
        ],
        literal: [
          "true",
          "false",
          "null"
        ]
      },
      contains: [
        hljs.HASH_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.NUMBER_MODE,
        {
          scope: "punctuation",
          match: /[.]{3}/,
          relevance: 0
        },
        {
          scope: "punctuation",
          begin: /[\!\(\)\:\=\[\]\{\|\}]{1}/,
          relevance: 0
        },
        {
          scope: "variable",
          begin: /\$/,
          end: /\W/,
          excludeEnd: true,
          relevance: 0
        },
        {
          scope: "meta",
          match: /@\w+/,
          excludeEnd: true
        },
        {
          scope: "symbol",
          begin: regex.concat(GQL_NAME, regex.lookahead(/\s*:/)),
          relevance: 0
        }
      ],
      illegal: [
        /[;<']/,
        /BEGIN/
      ]
    };
  }

  return graphql;

})();

    hljs.registerLanguage('graphql', hljsGrammar);
  })();/*! `http` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: HTTP
  Description: HTTP request and response headers with automatic body highlighting
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Category: protocols, web
  Website: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
  */

  function http(hljs) {
    const regex = hljs.regex;
    const VERSION = 'HTTP/([32]|1\\.[01])';
    const HEADER_NAME = /[A-Za-z][A-Za-z0-9-]*/;
    const HEADER = {
      className: 'attribute',
      begin: regex.concat('^', HEADER_NAME, '(?=\\:\\s)'),
      starts: { contains: [
        {
          className: "punctuation",
          begin: /: /,
          relevance: 0,
          starts: {
            end: '$',
            relevance: 0
          }
        }
      ] }
    };
    const HEADERS_AND_BODY = [
      HEADER,
      {
        begin: '\\n\\n',
        starts: {
          subLanguage: [],
          endsWithParent: true
        }
      }
    ];

    return {
      name: 'HTTP',
      aliases: [ 'https' ],
      illegal: /\S/,
      contains: [
        // response
        {
          begin: '^(?=' + VERSION + " \\d{3})",
          end: /$/,
          contains: [
            {
              className: "meta",
              begin: VERSION
            },
            {
              className: 'number',
              begin: '\\b\\d{3}\\b'
            }
          ],
          starts: {
            end: /\b\B/,
            illegal: /\S/,
            contains: HEADERS_AND_BODY
          }
        },
        // request
        {
          begin: '(?=^[A-Z]+ (.*?) ' + VERSION + '$)',
          end: /$/,
          contains: [
            {
              className: 'string',
              begin: ' ',
              end: ' ',
              excludeBegin: true,
              excludeEnd: true
            },
            {
              className: "meta",
              begin: VERSION
            },
            {
              className: 'keyword',
              begin: '[A-Z]+'
            }
          ],
          starts: {
            end: /\b\B/,
            illegal: /\S/,
            contains: HEADERS_AND_BODY
          }
        },
        // to allow headers to work even without a preamble
        hljs.inherit(HEADER, { relevance: 0 })
      ]
    };
  }

  return http;

})();

    hljs.registerLanguage('http', hljsGrammar);
  })();/*! `ini` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: TOML, also INI
  Description: TOML aims to be a minimal configuration file format that's easy to read due to obvious semantics.
  Contributors: Guillaume Gomez <guillaume1.gomez@gmail.com>
  Category: common, config
  Website: https://github.com/toml-lang/toml
  */

  function ini(hljs) {
    const regex = hljs.regex;
    const NUMBERS = {
      className: 'number',
      relevance: 0,
      variants: [
        { begin: /([+-]+)?[\d]+_[\d_]+/ },
        { begin: hljs.NUMBER_RE }
      ]
    };
    const COMMENTS = hljs.COMMENT();
    COMMENTS.variants = [
      {
        begin: /;/,
        end: /$/
      },
      {
        begin: /#/,
        end: /$/
      }
    ];
    const VARIABLES = {
      className: 'variable',
      variants: [
        { begin: /\$[\w\d"][\w\d_]*/ },
        { begin: /\$\{(.*?)\}/ }
      ]
    };
    const LITERALS = {
      className: 'literal',
      begin: /\bon|off|true|false|yes|no\b/
    };
    const STRINGS = {
      className: "string",
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {
          begin: "'''",
          end: "'''",
          relevance: 10
        },
        {
          begin: '"""',
          end: '"""',
          relevance: 10
        },
        {
          begin: '"',
          end: '"'
        },
        {
          begin: "'",
          end: "'"
        }
      ]
    };
    const ARRAY = {
      begin: /\[/,
      end: /\]/,
      contains: [
        COMMENTS,
        LITERALS,
        VARIABLES,
        STRINGS,
        NUMBERS,
        'self'
      ],
      relevance: 0
    };

    const BARE_KEY = /[A-Za-z0-9_-]+/;
    const QUOTED_KEY_DOUBLE_QUOTE = /"(\\"|[^"])*"/;
    const QUOTED_KEY_SINGLE_QUOTE = /'[^']*'/;
    const ANY_KEY = regex.either(
      BARE_KEY, QUOTED_KEY_DOUBLE_QUOTE, QUOTED_KEY_SINGLE_QUOTE
    );
    const DOTTED_KEY = regex.concat(
      ANY_KEY, '(\\s*\\.\\s*', ANY_KEY, ')*',
      regex.lookahead(/\s*=\s*[^#\s]/)
    );

    return {
      name: 'TOML, also INI',
      aliases: [ 'toml' ],
      case_insensitive: true,
      illegal: /\S/,
      contains: [
        COMMENTS,
        {
          className: 'section',
          begin: /\[+/,
          end: /\]+/
        },
        {
          begin: DOTTED_KEY,
          className: 'attr',
          starts: {
            end: /$/,
            contains: [
              COMMENTS,
              ARRAY,
              LITERALS,
              VARIABLES,
              STRINGS,
              NUMBERS
            ]
          }
        }
      ]
    };
  }

  return ini;

})();

    hljs.registerLanguage('ini', hljsGrammar);
  })();/*! `java` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  // https://docs.oracle.com/javase/specs/jls/se15/html/jls-3.html#jls-3.10
  var decimalDigits = '[0-9](_*[0-9])*';
  var frac = `\\.(${decimalDigits})`;
  var hexDigits = '[0-9a-fA-F](_*[0-9a-fA-F])*';
  var NUMERIC = {
    className: 'number',
    variants: [
      // DecimalFloatingPointLiteral
      // including ExponentPart
      { begin: `(\\b(${decimalDigits})((${frac})|\\.)?|(${frac}))` +
        `[eE][+-]?(${decimalDigits})[fFdD]?\\b` },
      // excluding ExponentPart
      { begin: `\\b(${decimalDigits})((${frac})[fFdD]?\\b|\\.([fFdD]\\b)?)` },
      { begin: `(${frac})[fFdD]?\\b` },
      { begin: `\\b(${decimalDigits})[fFdD]\\b` },

      // HexadecimalFloatingPointLiteral
      { begin: `\\b0[xX]((${hexDigits})\\.?|(${hexDigits})?\\.(${hexDigits}))` +
        `[pP][+-]?(${decimalDigits})[fFdD]?\\b` },

      // DecimalIntegerLiteral
      { begin: '\\b(0|[1-9](_*[0-9])*)[lL]?\\b' },

      // HexIntegerLiteral
      { begin: `\\b0[xX](${hexDigits})[lL]?\\b` },

      // OctalIntegerLiteral
      { begin: '\\b0(_*[0-7])*[lL]?\\b' },

      // BinaryIntegerLiteral
      { begin: '\\b0[bB][01](_*[01])*[lL]?\\b' },
    ],
    relevance: 0
  };

  /*
  Language: Java
  Author: Vsevolod Solovyov <vsevolod.solovyov@gmail.com>
  Category: common, enterprise
  Website: https://www.java.com/
  */


  /**
   * Allows recursive regex expressions to a given depth
   *
   * ie: recurRegex("(abc~~~)", /~~~/g, 2) becomes:
   * (abc(abc(abc)))
   *
   * @param {string} re
   * @param {RegExp} substitution (should be a g mode regex)
   * @param {number} depth
   * @returns {string}``
   */
  function recurRegex(re, substitution, depth) {
    if (depth === -1) return "";

    return re.replace(substitution, _ => {
      return recurRegex(re, substitution, depth - 1);
    });
  }

  /** @type LanguageFn */
  function java(hljs) {
    const regex = hljs.regex;
    const JAVA_IDENT_RE = '[\u00C0-\u02B8a-zA-Z_$][\u00C0-\u02B8a-zA-Z_$0-9]*';
    const GENERIC_IDENT_RE = JAVA_IDENT_RE
      + recurRegex('(?:<' + JAVA_IDENT_RE + '~~~(?:\\s*,\\s*' + JAVA_IDENT_RE + '~~~)*>)?', /~~~/g, 2);
    const MAIN_KEYWORDS = [
      'synchronized',
      'abstract',
      'private',
      'var',
      'static',
      'if',
      'const ',
      'for',
      'while',
      'strictfp',
      'finally',
      'protected',
      'import',
      'native',
      'final',
      'void',
      'enum',
      'else',
      'break',
      'transient',
      'catch',
      'instanceof',
      'volatile',
      'case',
      'assert',
      'package',
      'default',
      'public',
      'try',
      'switch',
      'continue',
      'throws',
      'protected',
      'public',
      'private',
      'module',
      'requires',
      'exports',
      'do',
      'sealed',
      'yield',
      'permits'
    ];

    const BUILT_INS = [
      'super',
      'this'
    ];

    const LITERALS = [
      'false',
      'true',
      'null'
    ];

    const TYPES = [
      'char',
      'boolean',
      'long',
      'float',
      'int',
      'byte',
      'short',
      'double'
    ];

    const KEYWORDS = {
      keyword: MAIN_KEYWORDS,
      literal: LITERALS,
      type: TYPES,
      built_in: BUILT_INS
    };

    const ANNOTATION = {
      className: 'meta',
      begin: '@' + JAVA_IDENT_RE,
      contains: [
        {
          begin: /\(/,
          end: /\)/,
          contains: [ "self" ] // allow nested () inside our annotation
        }
      ]
    };
    const PARAMS = {
      className: 'params',
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS,
      relevance: 0,
      contains: [ hljs.C_BLOCK_COMMENT_MODE ],
      endsParent: true
    };

    return {
      name: 'Java',
      aliases: [ 'jsp' ],
      keywords: KEYWORDS,
      illegal: /<\/|#/,
      contains: [
        hljs.COMMENT(
          '/\\*\\*',
          '\\*/',
          {
            relevance: 0,
            contains: [
              {
                // eat up @'s in emails to prevent them to be recognized as doctags
                begin: /\w+@/,
                relevance: 0
              },
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              }
            ]
          }
        ),
        // relevance boost
        {
          begin: /import java\.[a-z]+\./,
          keywords: "import",
          relevance: 2
        },
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          begin: /"""/,
          end: /"""/,
          className: "string",
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        {
          match: [
            /\b(?:class|interface|enum|extends|implements|new)/,
            /\s+/,
            JAVA_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          // Exceptions for hyphenated keywords
          match: /non-sealed/,
          scope: "keyword"
        },
        {
          begin: [
            regex.concat(/(?!else)/, JAVA_IDENT_RE),
            /\s+/,
            JAVA_IDENT_RE,
            /\s+/,
            /=(?!=)/
          ],
          className: {
            1: "type",
            3: "variable",
            5: "operator"
          }
        },
        {
          begin: [
            /record/,
            /\s+/,
            JAVA_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          },
          contains: [
            PARAMS,
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          // Expression keywords prevent 'keyword Name(...)' from being
          // recognized as a function definition
          beginKeywords: 'new throw return else',
          relevance: 0
        },
        {
          begin: [
            '(?:' + GENERIC_IDENT_RE + '\\s+)',
            hljs.UNDERSCORE_IDENT_RE,
            /\s*(?=\()/
          ],
          className: { 2: "title.function" },
          keywords: KEYWORDS,
          contains: [
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              keywords: KEYWORDS,
              relevance: 0,
              contains: [
                ANNOTATION,
                hljs.APOS_STRING_MODE,
                hljs.QUOTE_STRING_MODE,
                NUMERIC,
                hljs.C_BLOCK_COMMENT_MODE
              ]
            },
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        NUMERIC,
        ANNOTATION
      ]
    };
  }

  return java;

})();

    hljs.registerLanguage('java', hljsGrammar);
  })();/*! `javascript` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
  const KEYWORDS = [
    "as", // for exports
    "in",
    "of",
    "if",
    "for",
    "while",
    "finally",
    "var",
    "new",
    "function",
    "do",
    "return",
    "void",
    "else",
    "break",
    "catch",
    "instanceof",
    "with",
    "throw",
    "case",
    "default",
    "try",
    "switch",
    "continue",
    "typeof",
    "delete",
    "let",
    "yield",
    "const",
    "class",
    // JS handles these with a special rule
    // "get",
    // "set",
    "debugger",
    "async",
    "await",
    "static",
    "import",
    "from",
    "export",
    "extends"
  ];
  const LITERALS = [
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity"
  ];

  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
  const TYPES = [
    // Fundamental objects
    "Object",
    "Function",
    "Boolean",
    "Symbol",
    // numbers and dates
    "Math",
    "Date",
    "Number",
    "BigInt",
    // text
    "String",
    "RegExp",
    // Indexed collections
    "Array",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Int32Array",
    "Uint16Array",
    "Uint32Array",
    "BigInt64Array",
    "BigUint64Array",
    // Keyed collections
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    // Structured data
    "ArrayBuffer",
    "SharedArrayBuffer",
    "Atomics",
    "DataView",
    "JSON",
    // Control abstraction objects
    "Promise",
    "Generator",
    "GeneratorFunction",
    "AsyncFunction",
    // Reflection
    "Reflect",
    "Proxy",
    // Internationalization
    "Intl",
    // WebAssembly
    "WebAssembly"
  ];

  const ERROR_TYPES = [
    "Error",
    "EvalError",
    "InternalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError"
  ];

  const BUILT_IN_GLOBALS = [
    "setInterval",
    "setTimeout",
    "clearInterval",
    "clearTimeout",

    "require",
    "exports",

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape"
  ];

  const BUILT_IN_VARIABLES = [
    "arguments",
    "this",
    "super",
    "console",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "module",
    "global" // Node.js
  ];

  const BUILT_INS = [].concat(
    BUILT_IN_GLOBALS,
    TYPES,
    ERROR_TYPES
  );

  /*
  Language: JavaScript
  Description: JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.
  Category: common, scripting, web
  Website: https://developer.mozilla.org/en-US/docs/Web/JavaScript
  */


  /** @type LanguageFn */
  function javascript(hljs) {
    const regex = hljs.regex;
    /**
     * Takes a string like "<Booger" and checks to see
     * if we can find a matching "</Booger" later in the
     * content.
     * @param {RegExpMatchArray} match
     * @param {{after:number}} param1
     */
    const hasClosingTag = (match, { after }) => {
      const tag = "</" + match[0].slice(1);
      const pos = match.input.indexOf(tag, after);
      return pos !== -1;
    };

    const IDENT_RE$1 = IDENT_RE;
    const FRAGMENT = {
      begin: '<>',
      end: '</>'
    };
    // to avoid some special cases inside isTrulyOpeningTag
    const XML_SELF_CLOSING = /<[A-Za-z0-9\\._:-]+\s*\/>/;
    const XML_TAG = {
      begin: /<[A-Za-z0-9\\._:-]+/,
      end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
      /**
       * @param {RegExpMatchArray} match
       * @param {CallbackResponse} response
       */
      isTrulyOpeningTag: (match, response) => {
        const afterMatchIndex = match[0].length + match.index;
        const nextChar = match.input[afterMatchIndex];
        if (
          // HTML should not include another raw `<` inside a tag
          // nested type?
          // `<Array<Array<number>>`, etc.
          nextChar === "<" ||
          // the , gives away that this is not HTML
          // `<T, A extends keyof T, V>`
          nextChar === ","
          ) {
          response.ignoreMatch();
          return;
        }

        // `<something>`
        // Quite possibly a tag, lets look for a matching closing tag...
        if (nextChar === ">") {
          // if we cannot find a matching closing tag, then we
          // will ignore it
          if (!hasClosingTag(match, { after: afterMatchIndex })) {
            response.ignoreMatch();
          }
        }

        // `<blah />` (self-closing)
        // handled by simpleSelfClosing rule

        let m;
        const afterMatch = match.input.substring(afterMatchIndex);

        // some more template typing stuff
        //  <T = any>(key?: string) => Modify<
        if ((m = afterMatch.match(/^\s*=/))) {
          response.ignoreMatch();
          return;
        }

        // `<From extends string>`
        // technically this could be HTML, but it smells like a type
        // NOTE: This is ugh, but added specifically for https://github.com/highlightjs/highlight.js/issues/3276
        if ((m = afterMatch.match(/^\s+extends\s+/))) {
          if (m.index === 0) {
            response.ignoreMatch();
            // eslint-disable-next-line no-useless-return
            return;
          }
        }
      }
    };
    const KEYWORDS$1 = {
      $pattern: IDENT_RE,
      keyword: KEYWORDS,
      literal: LITERALS,
      built_in: BUILT_INS,
      "variable.language": BUILT_IN_VARIABLES
    };

    // https://tc39.es/ecma262/#sec-literals-numeric-literals
    const decimalDigits = '[0-9](_?[0-9])*';
    const frac = `\\.(${decimalDigits})`;
    // DecimalIntegerLiteral, including Annex B NonOctalDecimalIntegerLiteral
    // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
    const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
    const NUMBER = {
      className: 'number',
      variants: [
        // DecimalLiteral
        { begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))` +
          `[eE][+-]?(${decimalDigits})\\b` },
        { begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },

        // DecimalBigIntegerLiteral
        { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },

        // NonDecimalIntegerLiteral
        { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
        { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
        { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },

        // LegacyOctalIntegerLiteral (does not include underscore separators)
        // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
        { begin: "\\b0[0-7]+n?\\b" },
      ],
      relevance: 0
    };

    const SUBST = {
      className: 'subst',
      begin: '\\$\\{',
      end: '\\}',
      keywords: KEYWORDS$1,
      contains: [] // defined later
    };
    const HTML_TEMPLATE = {
      begin: 'html`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'xml'
      }
    };
    const CSS_TEMPLATE = {
      begin: 'css`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'css'
      }
    };
    const GRAPHQL_TEMPLATE = {
      begin: 'gql`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'graphql'
      }
    };
    const TEMPLATE_STRING = {
      className: 'string',
      begin: '`',
      end: '`',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ]
    };
    const JSDOC_COMMENT = hljs.COMMENT(
      /\/\*\*(?!\/)/,
      '\\*/',
      {
        relevance: 0,
        contains: [
          {
            begin: '(?=@[A-Za-z]+)',
            relevance: 0,
            contains: [
              {
                className: 'doctag',
                begin: '@[A-Za-z]+'
              },
              {
                className: 'type',
                begin: '\\{',
                end: '\\}',
                excludeEnd: true,
                excludeBegin: true,
                relevance: 0
              },
              {
                className: 'variable',
                begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
                endsParent: true,
                relevance: 0
              },
              // eat spaces (not newlines) so we can find
              // types or variables
              {
                begin: /(?=[^\n])\s/,
                relevance: 0
              }
            ]
          }
        ]
      }
    );
    const COMMENT = {
      className: "comment",
      variants: [
        JSDOC_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE
      ]
    };
    const SUBST_INTERNALS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      GRAPHQL_TEMPLATE,
      TEMPLATE_STRING,
      // Skip numbers when they are part of a variable name
      { match: /\$\d+/ },
      NUMBER,
      // This is intentional:
      // See https://github.com/highlightjs/highlight.js/issues/3288
      // hljs.REGEXP_MODE
    ];
    SUBST.contains = SUBST_INTERNALS
      .concat({
        // we need to pair up {} inside our subst to prevent
        // it from ending too early by matching another }
        begin: /\{/,
        end: /\}/,
        keywords: KEYWORDS$1,
        contains: [
          "self"
        ].concat(SUBST_INTERNALS)
      });
    const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
    const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
      // eat recursive parens in sub expressions
      {
        begin: /\(/,
        end: /\)/,
        keywords: KEYWORDS$1,
        contains: ["self"].concat(SUBST_AND_COMMENTS)
      }
    ]);
    const PARAMS = {
      className: 'params',
      begin: /\(/,
      end: /\)/,
      excludeBegin: true,
      excludeEnd: true,
      keywords: KEYWORDS$1,
      contains: PARAMS_CONTAINS
    };

    // ES6 classes
    const CLASS_OR_EXTENDS = {
      variants: [
        // class Car extends vehicle
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1,
            /\s+/,
            /extends/,
            /\s+/,
            regex.concat(IDENT_RE$1, "(", regex.concat(/\./, IDENT_RE$1), ")*")
          ],
          scope: {
            1: "keyword",
            3: "title.class",
            5: "keyword",
            7: "title.class.inherited"
          }
        },
        // class Car
        {
          match: [
            /class/,
            /\s+/,
            IDENT_RE$1
          ],
          scope: {
            1: "keyword",
            3: "title.class"
          }
        },

      ]
    };

    const CLASS_REFERENCE = {
      relevance: 0,
      match:
      regex.either(
        // Hard coded exceptions
        /\bJSON/,
        // Float32Array, OutT
        /\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,
        // CSSFactory, CSSFactoryT
        /\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,
        // FPs, FPsT
        /\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/,
        // P
        // single letters are not highlighted
        // BLAH
        // this will be flagged as a UPPER_CASE_CONSTANT instead
      ),
      className: "title.class",
      keywords: {
        _: [
          // se we still get relevance credit for JS library classes
          ...TYPES,
          ...ERROR_TYPES
        ]
      }
    };

    const USE_STRICT = {
      label: "use_strict",
      className: 'meta',
      relevance: 10,
      begin: /^\s*['"]use (strict|asm)['"]/
    };

    const FUNCTION_DEFINITION = {
      variants: [
        {
          match: [
            /function/,
            /\s+/,
            IDENT_RE$1,
            /(?=\s*\()/
          ]
        },
        // anonymous function
        {
          match: [
            /function/,
            /\s*(?=\()/
          ]
        }
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      label: "func.def",
      contains: [ PARAMS ],
      illegal: /%/
    };

    const UPPER_CASE_CONSTANT = {
      relevance: 0,
      match: /\b[A-Z][A-Z_0-9]+\b/,
      className: "variable.constant"
    };

    function noneOf(list) {
      return regex.concat("(?!", list.join("|"), ")");
    }

    const FUNCTION_CALL = {
      match: regex.concat(
        /\b/,
        noneOf([
          ...BUILT_IN_GLOBALS,
          "super",
          "import"
        ]),
        IDENT_RE$1, regex.lookahead(/\(/)),
      className: "title.function",
      relevance: 0
    };

    const PROPERTY_ACCESS = {
      begin: regex.concat(/\./, regex.lookahead(
        regex.concat(IDENT_RE$1, /(?![0-9A-Za-z$_(])/)
      )),
      end: IDENT_RE$1,
      excludeBegin: true,
      keywords: "prototype",
      className: "property",
      relevance: 0
    };

    const GETTER_OR_SETTER = {
      match: [
        /get|set/,
        /\s+/,
        IDENT_RE$1,
        /(?=\()/
      ],
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        { // eat to avoid empty params
          begin: /\(\)/
        },
        PARAMS
      ]
    };

    const FUNC_LEAD_IN_RE = '(\\(' +
      '[^()]*(\\(' +
      '[^()]*(\\(' +
      '[^()]*' +
      '\\)[^()]*)*' +
      '\\)[^()]*)*' +
      '\\)|' + hljs.UNDERSCORE_IDENT_RE + ')\\s*=>';

    const FUNCTION_VARIABLE = {
      match: [
        /const|var|let/, /\s+/,
        IDENT_RE$1, /\s*/,
        /=\s*/,
        /(async\s*)?/, // async is optional
        regex.lookahead(FUNC_LEAD_IN_RE)
      ],
      keywords: "async",
      className: {
        1: "keyword",
        3: "title.function"
      },
      contains: [
        PARAMS
      ]
    };

    return {
      name: 'JavaScript',
      aliases: ['js', 'jsx', 'mjs', 'cjs'],
      keywords: KEYWORDS$1,
      // this will be extended by TypeScript
      exports: { PARAMS_CONTAINS, CLASS_REFERENCE },
      illegal: /#(?![$_A-z])/,
      contains: [
        hljs.SHEBANG({
          label: "shebang",
          binary: "node",
          relevance: 5
        }),
        USE_STRICT,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        HTML_TEMPLATE,
        CSS_TEMPLATE,
        GRAPHQL_TEMPLATE,
        TEMPLATE_STRING,
        COMMENT,
        // Skip numbers when they are part of a variable name
        { match: /\$\d+/ },
        NUMBER,
        CLASS_REFERENCE,
        {
          className: 'attr',
          begin: IDENT_RE$1 + regex.lookahead(':'),
          relevance: 0
        },
        FUNCTION_VARIABLE,
        { // "value" container
          begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
          keywords: 'return throw case',
          relevance: 0,
          contains: [
            COMMENT,
            hljs.REGEXP_MODE,
            {
              className: 'function',
              // we have to count the parens to make sure we actually have the
              // correct bounding ( ) before the =>.  There could be any number of
              // sub-expressions inside also surrounded by parens.
              begin: FUNC_LEAD_IN_RE,
              returnBegin: true,
              end: '\\s*=>',
              contains: [
                {
                  className: 'params',
                  variants: [
                    {
                      begin: hljs.UNDERSCORE_IDENT_RE,
                      relevance: 0
                    },
                    {
                      className: null,
                      begin: /\(\s*\)/,
                      skip: true
                    },
                    {
                      begin: /\(/,
                      end: /\)/,
                      excludeBegin: true,
                      excludeEnd: true,
                      keywords: KEYWORDS$1,
                      contains: PARAMS_CONTAINS
                    }
                  ]
                }
              ]
            },
            { // could be a comma delimited list of params to a function call
              begin: /,/,
              relevance: 0
            },
            {
              match: /\s+/,
              relevance: 0
            },
            { // JSX
              variants: [
                { begin: FRAGMENT.begin, end: FRAGMENT.end },
                { match: XML_SELF_CLOSING },
                {
                  begin: XML_TAG.begin,
                  // we carefully check the opening tag to see if it truly
                  // is a tag and not a false positive
                  'on:begin': XML_TAG.isTrulyOpeningTag,
                  end: XML_TAG.end
                }
              ],
              subLanguage: 'xml',
              contains: [
                {
                  begin: XML_TAG.begin,
                  end: XML_TAG.end,
                  skip: true,
                  contains: ['self']
                }
              ]
            }
          ],
        },
        FUNCTION_DEFINITION,
        {
          // prevent this from getting swallowed up by function
          // since they appear "function like"
          beginKeywords: "while if switch catch for"
        },
        {
          // we have to count the parens to make sure we actually have the correct
          // bounding ( ).  There could be any number of sub-expressions inside
          // also surrounded by parens.
          begin: '\\b(?!function)' + hljs.UNDERSCORE_IDENT_RE +
            '\\(' + // first parens
            '[^()]*(\\(' +
              '[^()]*(\\(' +
                '[^()]*' +
              '\\)[^()]*)*' +
            '\\)[^()]*)*' +
            '\\)\\s*\\{', // end parens
          returnBegin:true,
          label: "func.def",
          contains: [
            PARAMS,
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1, className: "title.function" })
          ]
        },
        // catch ... so it won't trigger the property rule below
        {
          match: /\.\.\./,
          relevance: 0
        },
        PROPERTY_ACCESS,
        // hack: prevents detection of keywords in some circumstances
        // .keyword()
        // $keyword = x
        {
          match: '\\$' + IDENT_RE$1,
          relevance: 0
        },
        {
          match: [ /\bconstructor(?=\s*\()/ ],
          className: { 1: "title.function" },
          contains: [ PARAMS ]
        },
        FUNCTION_CALL,
        UPPER_CASE_CONSTANT,
        CLASS_OR_EXTENDS,
        GETTER_OR_SETTER,
        {
          match: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
        }
      ]
    };
  }

  return javascript;

})();

    hljs.registerLanguage('javascript', hljsGrammar);
  })();/*! `json` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: JSON
  Description: JSON (JavaScript Object Notation) is a lightweight data-interchange format.
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: http://www.json.org
  Category: common, protocols, web
  */

  function json(hljs) {
    const ATTRIBUTE = {
      className: 'attr',
      begin: /"(\\.|[^\\"\r\n])*"(?=\s*:)/,
      relevance: 1.01
    };
    const PUNCTUATION = {
      match: /[{}[\],:]/,
      className: "punctuation",
      relevance: 0
    };
    const LITERALS = [
      "true",
      "false",
      "null"
    ];
    // NOTE: normally we would rely on `keywords` for this but using a mode here allows us
    // - to use the very tight `illegal: \S` rule later to flag any other character
    // - as illegal indicating that despite looking like JSON we do not truly have
    // - JSON and thus improve false-positively greatly since JSON will try and claim
    // - all sorts of JSON looking stuff
    const LITERALS_MODE = {
      scope: "literal",
      beginKeywords: LITERALS.join(" "),
    };

    return {
      name: 'JSON',
      keywords:{
        literal: LITERALS,
      },
      contains: [
        ATTRIBUTE,
        PUNCTUATION,
        hljs.QUOTE_STRING_MODE,
        LITERALS_MODE,
        hljs.C_NUMBER_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ],
      illegal: '\\S'
    };
  }

  return json;

})();

    hljs.registerLanguage('json', hljsGrammar);
  })();/*! `lasso` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Lasso
  Author: Eric Knibbe <eric@lassosoft.com>
  Description: Lasso is a language and server platform for database-driven web applications. This definition handles Lasso 9 syntax and LassoScript for Lasso 8.6 and earlier.
  Website: http://www.lassosoft.com/What-Is-Lasso
  Category: database, web
  */

  function lasso(hljs) {
    const LASSO_IDENT_RE = '[a-zA-Z_][\\w.]*';
    const LASSO_ANGLE_RE = '<\\?(lasso(script)?|=)';
    const LASSO_CLOSE_RE = '\\]|\\?>';
    const LASSO_KEYWORDS = {
      $pattern: LASSO_IDENT_RE + '|&[lg]t;',
      literal:
        'true false none minimal full all void and or not '
        + 'bw nbw ew new cn ncn lt lte gt gte eq neq rx nrx ft',
      built_in:
        'array date decimal duration integer map pair string tag xml null '
        + 'boolean bytes keyword list locale queue set stack staticarray '
        + 'local var variable global data self inherited currentcapture givenblock',
      keyword:
        'cache database_names database_schemanames database_tablenames '
        + 'define_tag define_type email_batch encode_set html_comment handle '
        + 'handle_error header if inline iterate ljax_target link '
        + 'link_currentaction link_currentgroup link_currentrecord link_detail '
        + 'link_firstgroup link_firstrecord link_lastgroup link_lastrecord '
        + 'link_nextgroup link_nextrecord link_prevgroup link_prevrecord log '
        + 'loop namespace_using output_none portal private protect records '
        + 'referer referrer repeating resultset rows search_args '
        + 'search_arguments select sort_args sort_arguments thread_atomic '
        + 'value_list while abort case else fail_if fail_ifnot fail if_empty '
        + 'if_false if_null if_true loop_abort loop_continue loop_count params '
        + 'params_up return return_value run_children soap_definetag '
        + 'soap_lastrequest soap_lastresponse tag_name ascending average by '
        + 'define descending do equals frozen group handle_failure import in '
        + 'into join let match max min on order parent protected provide public '
        + 'require returnhome skip split_thread sum take thread to trait type '
        + 'where with yield yieldhome'
    };
    const HTML_COMMENT = hljs.COMMENT(
      '<!--',
      '-->',
      { relevance: 0 }
    );
    const LASSO_NOPROCESS = {
      className: 'meta',
      begin: '\\[noprocess\\]',
      starts: {
        end: '\\[/noprocess\\]',
        returnEnd: true,
        contains: [ HTML_COMMENT ]
      }
    };
    const LASSO_START = {
      className: 'meta',
      begin: '\\[/noprocess|' + LASSO_ANGLE_RE
    };
    const LASSO_DATAMEMBER = {
      className: 'symbol',
      begin: '\'' + LASSO_IDENT_RE + '\''
    };
    const LASSO_CODE = [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.inherit(hljs.C_NUMBER_MODE, { begin: hljs.C_NUMBER_RE + '|(-?infinity|NaN)\\b' }),
      hljs.inherit(hljs.APOS_STRING_MODE, { illegal: null }),
      hljs.inherit(hljs.QUOTE_STRING_MODE, { illegal: null }),
      {
        className: 'string',
        begin: '`',
        end: '`'
      },
      { // variables
        variants: [
          { begin: '[#$]' + LASSO_IDENT_RE },
          {
            begin: '#',
            end: '\\d+',
            illegal: '\\W'
          }
        ] },
      {
        className: 'type',
        begin: '::\\s*',
        end: LASSO_IDENT_RE,
        illegal: '\\W'
      },
      {
        className: 'params',
        variants: [
          {
            begin: '-(?!infinity)' + LASSO_IDENT_RE,
            relevance: 0
          },
          { begin: '(\\.\\.\\.)' }
        ]
      },
      {
        begin: /(->|\.)\s*/,
        relevance: 0,
        contains: [ LASSO_DATAMEMBER ]
      },
      {
        className: 'class',
        beginKeywords: 'define',
        returnEnd: true,
        end: '\\(|=>',
        contains: [ hljs.inherit(hljs.TITLE_MODE, { begin: LASSO_IDENT_RE + '(=(?!>))?|[-+*/%](?!>)' }) ]
      }
    ];
    return {
      name: 'Lasso',
      aliases: [
        'ls',
        'lassoscript'
      ],
      case_insensitive: true,
      keywords: LASSO_KEYWORDS,
      contains: [
        {
          className: 'meta',
          begin: LASSO_CLOSE_RE,
          relevance: 0,
          starts: { // markup
            end: '\\[|' + LASSO_ANGLE_RE,
            returnEnd: true,
            relevance: 0,
            contains: [ HTML_COMMENT ]
          }
        },
        LASSO_NOPROCESS,
        LASSO_START,
        {
          className: 'meta',
          begin: '\\[no_square_brackets',
          starts: {
            end: '\\[/no_square_brackets\\]', // not implemented in the language
            keywords: LASSO_KEYWORDS,
            contains: [
              {
                className: 'meta',
                begin: LASSO_CLOSE_RE,
                relevance: 0,
                starts: {
                  end: '\\[noprocess\\]|' + LASSO_ANGLE_RE,
                  returnEnd: true,
                  contains: [ HTML_COMMENT ]
                }
              },
              LASSO_NOPROCESS,
              LASSO_START
            ].concat(LASSO_CODE)
          }
        },
        {
          className: 'meta',
          begin: '\\[',
          relevance: 0
        },
        {
          className: 'meta',
          begin: '^#!',
          end: 'lasso9$',
          relevance: 10
        }
      ].concat(LASSO_CODE)
    };
  }

  return lasso;

})();

    hljs.registerLanguage('lasso', hljsGrammar);
  })();/*! `latex` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: LaTeX
  Author: Benedikt Wilde <bwilde@posteo.de>
  Website: https://www.latex-project.org
  Category: markup
  */

  /** @type LanguageFn */
  function latex(hljs) {
    const regex = hljs.regex;
    const KNOWN_CONTROL_WORDS = regex.either(...[
      '(?:NeedsTeXFormat|RequirePackage|GetIdInfo)',
      'Provides(?:Expl)?(?:Package|Class|File)',
      '(?:DeclareOption|ProcessOptions)',
      '(?:documentclass|usepackage|input|include)',
      'makeat(?:letter|other)',
      'ExplSyntax(?:On|Off)',
      '(?:new|renew|provide)?command',
      '(?:re)newenvironment',
      '(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand',
      '(?:New|Renew|Provide|Declare)DocumentEnvironment',
      '(?:(?:e|g|x)?def|let)',
      '(?:begin|end)',
      '(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)',
      'caption',
      '(?:label|(?:eq|page|name)?ref|(?:paren|foot|super)?cite)',
      '(?:alpha|beta|[Gg]amma|[Dd]elta|(?:var)?epsilon|zeta|eta|[Tt]heta|vartheta)',
      '(?:iota|(?:var)?kappa|[Ll]ambda|mu|nu|[Xx]i|[Pp]i|varpi|(?:var)rho)',
      '(?:[Ss]igma|varsigma|tau|[Uu]psilon|[Pp]hi|varphi|chi|[Pp]si|[Oo]mega)',
      '(?:frac|sum|prod|lim|infty|times|sqrt|leq|geq|left|right|middle|[bB]igg?)',
      '(?:[lr]angle|q?quad|[lcvdi]?dots|d?dot|hat|tilde|bar)'
    ].map(word => word + '(?![a-zA-Z@:_])'));
    const L3_REGEX = new RegExp([
      // A function \module_function_name:signature or \__module_function_name:signature,
      // where both module and function_name need at least two characters and
      // function_name may contain single underscores.
      '(?:__)?[a-zA-Z]{2,}_[a-zA-Z](?:_?[a-zA-Z])+:[a-zA-Z]*',
      // A variable \scope_module_and_name_type or \scope__module_ane_name_type,
      // where scope is one of l, g or c, type needs at least two characters
      // and module_and_name may contain single underscores.
      '[lgc]__?[a-zA-Z](?:_?[a-zA-Z])*_[a-zA-Z]{2,}',
      // A quark \q_the_name or \q__the_name or
      // scan mark \s_the_name or \s__vthe_name,
      // where variable_name needs at least two characters and
      // may contain single underscores.
      '[qs]__?[a-zA-Z](?:_?[a-zA-Z])+',
      // Other LaTeX3 macro names that are not covered by the three rules above.
      'use(?:_i)?:[a-zA-Z]*',
      '(?:else|fi|or):',
      '(?:if|cs|exp):w',
      '(?:hbox|vbox):n',
      '::[a-zA-Z]_unbraced',
      '::[a-zA-Z:]'
    ].map(pattern => pattern + '(?![a-zA-Z:_])').join('|'));
    const L2_VARIANTS = [
      { begin: /[a-zA-Z@]+/ }, // control word
      { begin: /[^a-zA-Z@]?/ } // control symbol
    ];
    const DOUBLE_CARET_VARIANTS = [
      { begin: /\^{6}[0-9a-f]{6}/ },
      { begin: /\^{5}[0-9a-f]{5}/ },
      { begin: /\^{4}[0-9a-f]{4}/ },
      { begin: /\^{3}[0-9a-f]{3}/ },
      { begin: /\^{2}[0-9a-f]{2}/ },
      { begin: /\^{2}[\u0000-\u007f]/ }
    ];
    const CONTROL_SEQUENCE = {
      className: 'keyword',
      begin: /\\/,
      relevance: 0,
      contains: [
        {
          endsParent: true,
          begin: KNOWN_CONTROL_WORDS
        },
        {
          endsParent: true,
          begin: L3_REGEX
        },
        {
          endsParent: true,
          variants: DOUBLE_CARET_VARIANTS
        },
        {
          endsParent: true,
          relevance: 0,
          variants: L2_VARIANTS
        }
      ]
    };
    const MACRO_PARAM = {
      className: 'params',
      relevance: 0,
      begin: /#+\d?/
    };
    const DOUBLE_CARET_CHAR = {
      // relevance: 1
      variants: DOUBLE_CARET_VARIANTS };
    const SPECIAL_CATCODE = {
      className: 'built_in',
      relevance: 0,
      begin: /[$&^_]/
    };
    const MAGIC_COMMENT = {
      className: 'meta',
      begin: /% ?!(T[eE]X|tex|BIB|bib)/,
      end: '$',
      relevance: 10
    };
    const COMMENT = hljs.COMMENT(
      '%',
      '$',
      { relevance: 0 }
    );
    const EVERYTHING_BUT_VERBATIM = [
      CONTROL_SEQUENCE,
      MACRO_PARAM,
      DOUBLE_CARET_CHAR,
      SPECIAL_CATCODE,
      MAGIC_COMMENT,
      COMMENT
    ];
    const BRACE_GROUP_NO_VERBATIM = {
      begin: /\{/,
      end: /\}/,
      relevance: 0,
      contains: [
        'self',
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
    const ARGUMENT_BRACES = hljs.inherit(
      BRACE_GROUP_NO_VERBATIM,
      {
        relevance: 0,
        endsParent: true,
        contains: [
          BRACE_GROUP_NO_VERBATIM,
          ...EVERYTHING_BUT_VERBATIM
        ]
      }
    );
    const ARGUMENT_BRACKETS = {
      begin: /\[/,
      end: /\]/,
      endsParent: true,
      relevance: 0,
      contains: [
        BRACE_GROUP_NO_VERBATIM,
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
    const SPACE_GOBBLER = {
      begin: /\s+/,
      relevance: 0
    };
    const ARGUMENT_M = [ ARGUMENT_BRACES ];
    const ARGUMENT_O = [ ARGUMENT_BRACKETS ];
    const ARGUMENT_AND_THEN = function(arg, starts_mode) {
      return {
        contains: [ SPACE_GOBBLER ],
        starts: {
          relevance: 0,
          contains: arg,
          starts: starts_mode
        }
      };
    };
    const CSNAME = function(csname, starts_mode) {
      return {
        begin: '\\\\' + csname + '(?![a-zA-Z@:_])',
        keywords: {
          $pattern: /\\[a-zA-Z]+/,
          keyword: '\\' + csname
        },
        relevance: 0,
        contains: [ SPACE_GOBBLER ],
        starts: starts_mode
      };
    };
    const BEGIN_ENV = function(envname, starts_mode) {
      return hljs.inherit(
        {
          begin: '\\\\begin(?=[ \t]*(\\r?\\n[ \t]*)?\\{' + envname + '\\})',
          keywords: {
            $pattern: /\\[a-zA-Z]+/,
            keyword: '\\begin'
          },
          relevance: 0,
        },
        ARGUMENT_AND_THEN(ARGUMENT_M, starts_mode)
      );
    };
    const VERBATIM_DELIMITED_EQUAL = (innerName = "string") => {
      return hljs.END_SAME_AS_BEGIN({
        className: innerName,
        begin: /(.|\r?\n)/,
        end: /(.|\r?\n)/,
        excludeBegin: true,
        excludeEnd: true,
        endsParent: true
      });
    };
    const VERBATIM_DELIMITED_ENV = function(envname) {
      return {
        className: 'string',
        end: '(?=\\\\end\\{' + envname + '\\})'
      };
    };

    const VERBATIM_DELIMITED_BRACES = (innerName = "string") => {
      return {
        relevance: 0,
        begin: /\{/,
        starts: {
          endsParent: true,
          contains: [
            {
              className: innerName,
              end: /(?=\})/,
              endsParent: true,
              contains: [
                {
                  begin: /\{/,
                  end: /\}/,
                  relevance: 0,
                  contains: [ "self" ]
                }
              ],
            }
          ]
        }
      };
    };
    const VERBATIM = [
      ...[
        'verb',
        'lstinline'
      ].map(csname => CSNAME(csname, { contains: [ VERBATIM_DELIMITED_EQUAL() ] })),
      CSNAME('mint', ARGUMENT_AND_THEN(ARGUMENT_M, { contains: [ VERBATIM_DELIMITED_EQUAL() ] })),
      CSNAME('mintinline', ARGUMENT_AND_THEN(ARGUMENT_M, { contains: [
        VERBATIM_DELIMITED_BRACES(),
        VERBATIM_DELIMITED_EQUAL()
      ] })),
      CSNAME('url', { contains: [
        VERBATIM_DELIMITED_BRACES("link"),
        VERBATIM_DELIMITED_BRACES("link")
      ] }),
      CSNAME('hyperref', { contains: [ VERBATIM_DELIMITED_BRACES("link") ] }),
      CSNAME('href', ARGUMENT_AND_THEN(ARGUMENT_O, { contains: [ VERBATIM_DELIMITED_BRACES("link") ] })),
      ...[].concat(...[
        '',
        '\\*'
      ].map(suffix => [
        BEGIN_ENV('verbatim' + suffix, VERBATIM_DELIMITED_ENV('verbatim' + suffix)),
        BEGIN_ENV('filecontents' + suffix, ARGUMENT_AND_THEN(ARGUMENT_M, VERBATIM_DELIMITED_ENV('filecontents' + suffix))),
        ...[
          '',
          'B',
          'L'
        ].map(prefix =>
          BEGIN_ENV(prefix + 'Verbatim' + suffix, ARGUMENT_AND_THEN(ARGUMENT_O, VERBATIM_DELIMITED_ENV(prefix + 'Verbatim' + suffix)))
        )
      ])),
      BEGIN_ENV('minted', ARGUMENT_AND_THEN(ARGUMENT_O, ARGUMENT_AND_THEN(ARGUMENT_M, VERBATIM_DELIMITED_ENV('minted')))),
    ];

    return {
      name: 'LaTeX',
      aliases: [ 'tex' ],
      contains: [
        ...VERBATIM,
        ...EVERYTHING_BUT_VERBATIM
      ]
    };
  }

  return latex;

})();

    hljs.registerLanguage('latex', hljsGrammar);
  })();/*! `less` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'p',
    'q',
    'quote',
    'samp',
    'section',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'animation',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-decoration-break',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'cx',
    'cy',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flow',
    'flood-color',
    'flood-opacity',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-size',
    'font-size-adjust',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-variant',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'inline-size',
    'isolation',
    'kerning',
    'justify-content',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'mask',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'pointer-events',
    'position',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'row-gap',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'speak',
    'speak-as',
    'src', // @font-face
    'tab-size',
    'table-layout',
    'text-anchor',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-style',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-transform',
    'text-underline-position',
    'top',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'unicode-bidi',
    'vector-effect',
    'vertical-align',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index'
  ].sort().reverse();

  // some grammars use them all as a single group
  const PSEUDO_SELECTORS = PSEUDO_CLASSES.concat(PSEUDO_ELEMENTS).sort().reverse();

  /*
  Language: Less
  Description: It's CSS, with just a little more.
  Author:   Max Mikhailov <seven.phases.max@gmail.com>
  Website: http://lesscss.org
  Category: common, css, web
  */


  /** @type LanguageFn */
  function less(hljs) {
    const modes = MODES(hljs);
    const PSEUDO_SELECTORS$1 = PSEUDO_SELECTORS;

    const AT_MODIFIERS = "and or not only";
    const IDENT_RE = '[\\w-]+'; // yes, Less identifiers may begin with a digit
    const INTERP_IDENT_RE = '(' + IDENT_RE + '|@\\{' + IDENT_RE + '\\})';

    /* Generic Modes */

    const RULES = []; const VALUE_MODES = []; // forward def. for recursive modes

    const STRING_MODE = function(c) {
      return {
      // Less strings are not multiline (also include '~' for more consistent coloring of "escaped" strings)
        className: 'string',
        begin: '~?' + c + '.*?' + c
      };
    };

    const IDENT_MODE = function(name, begin, relevance) {
      return {
        className: name,
        begin: begin,
        relevance: relevance
      };
    };

    const AT_KEYWORDS = {
      $pattern: /[a-z-]+/,
      keyword: AT_MODIFIERS,
      attribute: MEDIA_FEATURES.join(" ")
    };

    const PARENS_MODE = {
      // used only to properly balance nested parens inside mixin call, def. arg list
      begin: '\\(',
      end: '\\)',
      contains: VALUE_MODES,
      keywords: AT_KEYWORDS,
      relevance: 0
    };

    // generic Less highlighter (used almost everywhere except selectors):
    VALUE_MODES.push(
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING_MODE("'"),
      STRING_MODE('"'),
      modes.CSS_NUMBER_MODE, // fixme: it does not include dot for numbers like .5em :(
      {
        begin: '(url|data-uri)\\(',
        starts: {
          className: 'string',
          end: '[\\)\\n]',
          excludeEnd: true
        }
      },
      modes.HEXCOLOR,
      PARENS_MODE,
      IDENT_MODE('variable', '@@?' + IDENT_RE, 10),
      IDENT_MODE('variable', '@\\{' + IDENT_RE + '\\}'),
      IDENT_MODE('built_in', '~?`[^`]*?`'), // inline javascript (or whatever host language) *multiline* string
      { // @media features (it’s here to not duplicate things in AT_RULE_MODE with extra PARENS_MODE overriding):
        className: 'attribute',
        begin: IDENT_RE + '\\s*:',
        end: ':',
        returnBegin: true,
        excludeEnd: true
      },
      modes.IMPORTANT,
      { beginKeywords: 'and not' },
      modes.FUNCTION_DISPATCH
    );

    const VALUE_WITH_RULESETS = VALUE_MODES.concat({
      begin: /\{/,
      end: /\}/,
      contains: RULES
    });

    const MIXIN_GUARD_MODE = {
      beginKeywords: 'when',
      endsWithParent: true,
      contains: [ { beginKeywords: 'and not' } ].concat(VALUE_MODES) // using this form to override VALUE’s 'function' match
    };

    /* Rule-Level Modes */

    const RULE_MODE = {
      begin: INTERP_IDENT_RE + '\\s*:',
      returnBegin: true,
      end: /[;}]/,
      relevance: 0,
      contains: [
        { begin: /-(webkit|moz|ms|o)-/ },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b',
          end: /(?=:)/,
          starts: {
            endsWithParent: true,
            illegal: '[<=$]',
            relevance: 0,
            contains: VALUE_MODES
          }
        }
      ]
    };

    const AT_RULE_MODE = {
      className: 'keyword',
      begin: '@(import|media|charset|font-face|(-[a-z]+-)?keyframes|supports|document|namespace|page|viewport|host)\\b',
      starts: {
        end: '[;{}]',
        keywords: AT_KEYWORDS,
        returnEnd: true,
        contains: VALUE_MODES,
        relevance: 0
      }
    };

    // variable definitions and calls
    const VAR_RULE_MODE = {
      className: 'variable',
      variants: [
        // using more strict pattern for higher relevance to increase chances of Less detection.
        // this is *the only* Less specific statement used in most of the sources, so...
        // (we’ll still often loose to the css-parser unless there's '//' comment,
        // simply because 1 variable just can't beat 99 properties :)
        {
          begin: '@' + IDENT_RE + '\\s*:',
          relevance: 15
        },
        { begin: '@' + IDENT_RE }
      ],
      starts: {
        end: '[;}]',
        returnEnd: true,
        contains: VALUE_WITH_RULESETS
      }
    };

    const SELECTOR_MODE = {
      // first parse unambiguous selectors (i.e. those not starting with tag)
      // then fall into the scary lookahead-discriminator variant.
      // this mode also handles mixin definitions and calls
      variants: [
        {
          begin: '[\\.#:&\\[>]',
          end: '[;{}]' // mixin calls end with ';'
        },
        {
          begin: INTERP_IDENT_RE,
          end: /\{/
        }
      ],
      returnBegin: true,
      returnEnd: true,
      illegal: '[<=\'$"]',
      relevance: 0,
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        MIXIN_GUARD_MODE,
        IDENT_MODE('keyword', 'all\\b'),
        IDENT_MODE('variable', '@\\{' + IDENT_RE + '\\}'), // otherwise it’s identified as tag
        
        {
          begin: '\\b(' + TAGS.join('|') + ')\\b',
          className: 'selector-tag'
        },
        modes.CSS_NUMBER_MODE,
        IDENT_MODE('selector-tag', INTERP_IDENT_RE, 0),
        IDENT_MODE('selector-id', '#' + INTERP_IDENT_RE),
        IDENT_MODE('selector-class', '\\.' + INTERP_IDENT_RE, 0),
        IDENT_MODE('selector-tag', '&', 0),
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-pseudo',
          begin: ':(' + PSEUDO_CLASSES.join('|') + ')'
        },
        {
          className: 'selector-pseudo',
          begin: ':(:)?(' + PSEUDO_ELEMENTS.join('|') + ')'
        },
        {
          begin: /\(/,
          end: /\)/,
          relevance: 0,
          contains: VALUE_WITH_RULESETS
        }, // argument list of parametric mixins
        { begin: '!important' }, // eat !important after mixin call or it will be colored as tag
        modes.FUNCTION_DISPATCH
      ]
    };

    const PSEUDO_SELECTOR_MODE = {
      begin: IDENT_RE + ':(:)?' + `(${PSEUDO_SELECTORS$1.join('|')})`,
      returnBegin: true,
      contains: [ SELECTOR_MODE ]
    };

    RULES.push(
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      AT_RULE_MODE,
      VAR_RULE_MODE,
      PSEUDO_SELECTOR_MODE,
      RULE_MODE,
      SELECTOR_MODE,
      MIXIN_GUARD_MODE,
      modes.FUNCTION_DISPATCH
    );

    return {
      name: 'Less',
      case_insensitive: true,
      illegal: '[=>\'/<($"]',
      contains: RULES
    };
  }

  return less;

})();

    hljs.registerLanguage('less', hljsGrammar);
  })();/*! `makefile` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Makefile
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Contributors: Joël Porquet <joel@porquet.org>
  Website: https://www.gnu.org/software/make/manual/html_node/Introduction.html
  Category: common, build-system
  */

  function makefile(hljs) {
    /* Variables: simple (eg $(var)) and special (eg $@) */
    const VARIABLE = {
      className: 'variable',
      variants: [
        {
          begin: '\\$\\(' + hljs.UNDERSCORE_IDENT_RE + '\\)',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        { begin: /\$[@%<?\^\+\*]/ }
      ]
    };
    /* Quoted string with variables inside */
    const QUOTE_STRING = {
      className: 'string',
      begin: /"/,
      end: /"/,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        VARIABLE
      ]
    };
    /* Function: $(func arg,...) */
    const FUNC = {
      className: 'variable',
      begin: /\$\([\w-]+\s/,
      end: /\)/,
      keywords: { built_in:
          'subst patsubst strip findstring filter filter-out sort '
          + 'word wordlist firstword lastword dir notdir suffix basename '
          + 'addsuffix addprefix join wildcard realpath abspath error warning '
          + 'shell origin flavor foreach if or and call eval file value' },
      contains: [ VARIABLE ]
    };
    /* Variable assignment */
    const ASSIGNMENT = { begin: '^' + hljs.UNDERSCORE_IDENT_RE + '\\s*(?=[:+?]?=)' };
    /* Meta targets (.PHONY) */
    const META = {
      className: 'meta',
      begin: /^\.PHONY:/,
      end: /$/,
      keywords: {
        $pattern: /[\.\w]+/,
        keyword: '.PHONY'
      }
    };
    /* Targets */
    const TARGET = {
      className: 'section',
      begin: /^[^\s]+:/,
      end: /$/,
      contains: [ VARIABLE ]
    };
    return {
      name: 'Makefile',
      aliases: [
        'mk',
        'mak',
        'make',
      ],
      keywords: {
        $pattern: /[\w-]+/,
        keyword: 'define endef undefine ifdef ifndef ifeq ifneq else endif '
        + 'include -include sinclude override export unexport private vpath'
      },
      contains: [
        hljs.HASH_COMMENT_MODE,
        VARIABLE,
        QUOTE_STRING,
        FUNC,
        ASSIGNMENT,
        META,
        TARGET
      ]
    };
  }

  return makefile;

})();

    hljs.registerLanguage('makefile', hljsGrammar);
  })();/*! `markdown` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Markdown
  Requires: xml.js
  Author: John Crepezzi <john.crepezzi@gmail.com>
  Website: https://daringfireball.net/projects/markdown/
  Category: common, markup
  */

  function markdown(hljs) {
    const regex = hljs.regex;
    const INLINE_HTML = {
      begin: /<\/?[A-Za-z_]/,
      end: '>',
      subLanguage: 'xml',
      relevance: 0
    };
    const HORIZONTAL_RULE = {
      begin: '^[-\\*]{3,}',
      end: '$'
    };
    const CODE = {
      className: 'code',
      variants: [
        // TODO: fix to allow these to work with sublanguage also
        { begin: '(`{3,})[^`](.|\\n)*?\\1`*[ ]*' },
        { begin: '(~{3,})[^~](.|\\n)*?\\1~*[ ]*' },
        // needed to allow markdown as a sublanguage to work
        {
          begin: '```',
          end: '```+[ ]*$'
        },
        {
          begin: '~~~',
          end: '~~~+[ ]*$'
        },
        { begin: '`.+?`' },
        {
          begin: '(?=^( {4}|\\t))',
          // use contains to gobble up multiple lines to allow the block to be whatever size
          // but only have a single open/close tag vs one per line
          contains: [
            {
              begin: '^( {4}|\\t)',
              end: '(\\n)$'
            }
          ],
          relevance: 0
        }
      ]
    };
    const LIST = {
      className: 'bullet',
      begin: '^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)',
      end: '\\s+',
      excludeEnd: true
    };
    const LINK_REFERENCE = {
      begin: /^\[[^\n]+\]:/,
      returnBegin: true,
      contains: [
        {
          className: 'symbol',
          begin: /\[/,
          end: /\]/,
          excludeBegin: true,
          excludeEnd: true
        },
        {
          className: 'link',
          begin: /:\s*/,
          end: /$/,
          excludeBegin: true
        }
      ]
    };
    const URL_SCHEME = /[A-Za-z][A-Za-z0-9+.-]*/;
    const LINK = {
      variants: [
        // too much like nested array access in so many languages
        // to have any real relevance
        {
          begin: /\[.+?\]\[.*?\]/,
          relevance: 0
        },
        // popular internet URLs
        {
          begin: /\[.+?\]\(((data|javascript|mailto):|(?:http|ftp)s?:\/\/).*?\)/,
          relevance: 2
        },
        {
          begin: regex.concat(/\[.+?\]\(/, URL_SCHEME, /:\/\/.*?\)/),
          relevance: 2
        },
        // relative urls
        {
          begin: /\[.+?\]\([./?&#].*?\)/,
          relevance: 1
        },
        // whatever else, lower relevance (might not be a link at all)
        {
          begin: /\[.*?\]\(.*?\)/,
          relevance: 0
        }
      ],
      returnBegin: true,
      contains: [
        {
          // empty strings for alt or link text
          match: /\[(?=\])/ },
        {
          className: 'string',
          relevance: 0,
          begin: '\\[',
          end: '\\]',
          excludeBegin: true,
          returnEnd: true
        },
        {
          className: 'link',
          relevance: 0,
          begin: '\\]\\(',
          end: '\\)',
          excludeBegin: true,
          excludeEnd: true
        },
        {
          className: 'symbol',
          relevance: 0,
          begin: '\\]\\[',
          end: '\\]',
          excludeBegin: true,
          excludeEnd: true
        }
      ]
    };
    const BOLD = {
      className: 'strong',
      contains: [], // defined later
      variants: [
        {
          begin: /_{2}(?!\s)/,
          end: /_{2}/
        },
        {
          begin: /\*{2}(?!\s)/,
          end: /\*{2}/
        }
      ]
    };
    const ITALIC = {
      className: 'emphasis',
      contains: [], // defined later
      variants: [
        {
          begin: /\*(?![*\s])/,
          end: /\*/
        },
        {
          begin: /_(?![_\s])/,
          end: /_/,
          relevance: 0
        }
      ]
    };

    // 3 level deep nesting is not allowed because it would create confusion
    // in cases like `***testing***` because where we don't know if the last
    // `***` is starting a new bold/italic or finishing the last one
    const BOLD_WITHOUT_ITALIC = hljs.inherit(BOLD, { contains: [] });
    const ITALIC_WITHOUT_BOLD = hljs.inherit(ITALIC, { contains: [] });
    BOLD.contains.push(ITALIC_WITHOUT_BOLD);
    ITALIC.contains.push(BOLD_WITHOUT_ITALIC);

    let CONTAINABLE = [
      INLINE_HTML,
      LINK
    ];

    [
      BOLD,
      ITALIC,
      BOLD_WITHOUT_ITALIC,
      ITALIC_WITHOUT_BOLD
    ].forEach(m => {
      m.contains = m.contains.concat(CONTAINABLE);
    });

    CONTAINABLE = CONTAINABLE.concat(BOLD, ITALIC);

    const HEADER = {
      className: 'section',
      variants: [
        {
          begin: '^#{1,6}',
          end: '$',
          contains: CONTAINABLE
        },
        {
          begin: '(?=^.+?\\n[=-]{2,}$)',
          contains: [
            { begin: '^[=-]*$' },
            {
              begin: '^',
              end: "\\n",
              contains: CONTAINABLE
            }
          ]
        }
      ]
    };

    const BLOCKQUOTE = {
      className: 'quote',
      begin: '^>\\s+',
      contains: CONTAINABLE,
      end: '$'
    };

    return {
      name: 'Markdown',
      aliases: [
        'md',
        'mkdown',
        'mkd'
      ],
      contains: [
        HEADER,
        INLINE_HTML,
        LIST,
        BOLD,
        ITALIC,
        BLOCKQUOTE,
        CODE,
        HORIZONTAL_RULE,
        LINK,
        LINK_REFERENCE
      ]
    };
  }

  return markdown;

})();

    hljs.registerLanguage('markdown', hljsGrammar);
  })();/*! `mathematica` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const SYSTEM_SYMBOLS = [
    "AASTriangle",
    "AbelianGroup",
    "Abort",
    "AbortKernels",
    "AbortProtect",
    "AbortScheduledTask",
    "Above",
    "Abs",
    "AbsArg",
    "AbsArgPlot",
    "Absolute",
    "AbsoluteCorrelation",
    "AbsoluteCorrelationFunction",
    "AbsoluteCurrentValue",
    "AbsoluteDashing",
    "AbsoluteFileName",
    "AbsoluteOptions",
    "AbsolutePointSize",
    "AbsoluteThickness",
    "AbsoluteTime",
    "AbsoluteTiming",
    "AcceptanceThreshold",
    "AccountingForm",
    "Accumulate",
    "Accuracy",
    "AccuracyGoal",
    "AcousticAbsorbingValue",
    "AcousticImpedanceValue",
    "AcousticNormalVelocityValue",
    "AcousticPDEComponent",
    "AcousticPressureCondition",
    "AcousticRadiationValue",
    "AcousticSoundHardValue",
    "AcousticSoundSoftCondition",
    "ActionDelay",
    "ActionMenu",
    "ActionMenuBox",
    "ActionMenuBoxOptions",
    "Activate",
    "Active",
    "ActiveClassification",
    "ActiveClassificationObject",
    "ActiveItem",
    "ActivePrediction",
    "ActivePredictionObject",
    "ActiveStyle",
    "AcyclicGraphQ",
    "AddOnHelpPath",
    "AddSides",
    "AddTo",
    "AddToSearchIndex",
    "AddUsers",
    "AdjacencyGraph",
    "AdjacencyList",
    "AdjacencyMatrix",
    "AdjacentMeshCells",
    "Adjugate",
    "AdjustmentBox",
    "AdjustmentBoxOptions",
    "AdjustTimeSeriesForecast",
    "AdministrativeDivisionData",
    "AffineHalfSpace",
    "AffineSpace",
    "AffineStateSpaceModel",
    "AffineTransform",
    "After",
    "AggregatedEntityClass",
    "AggregationLayer",
    "AircraftData",
    "AirportData",
    "AirPressureData",
    "AirSoundAttenuation",
    "AirTemperatureData",
    "AiryAi",
    "AiryAiPrime",
    "AiryAiZero",
    "AiryBi",
    "AiryBiPrime",
    "AiryBiZero",
    "AlgebraicIntegerQ",
    "AlgebraicNumber",
    "AlgebraicNumberDenominator",
    "AlgebraicNumberNorm",
    "AlgebraicNumberPolynomial",
    "AlgebraicNumberTrace",
    "AlgebraicRules",
    "AlgebraicRulesData",
    "Algebraics",
    "AlgebraicUnitQ",
    "Alignment",
    "AlignmentMarker",
    "AlignmentPoint",
    "All",
    "AllowAdultContent",
    "AllowChatServices",
    "AllowedCloudExtraParameters",
    "AllowedCloudParameterExtensions",
    "AllowedDimensions",
    "AllowedFrequencyRange",
    "AllowedHeads",
    "AllowGroupClose",
    "AllowIncomplete",
    "AllowInlineCells",
    "AllowKernelInitialization",
    "AllowLooseGrammar",
    "AllowReverseGroupClose",
    "AllowScriptLevelChange",
    "AllowVersionUpdate",
    "AllTrue",
    "Alphabet",
    "AlphabeticOrder",
    "AlphabeticSort",
    "AlphaChannel",
    "AlternateImage",
    "AlternatingFactorial",
    "AlternatingGroup",
    "AlternativeHypothesis",
    "Alternatives",
    "AltitudeMethod",
    "AmbientLight",
    "AmbiguityFunction",
    "AmbiguityList",
    "Analytic",
    "AnatomyData",
    "AnatomyForm",
    "AnatomyPlot3D",
    "AnatomySkinStyle",
    "AnatomyStyling",
    "AnchoredSearch",
    "And",
    "AndersonDarlingTest",
    "AngerJ",
    "AngleBisector",
    "AngleBracket",
    "AnglePath",
    "AnglePath3D",
    "AngleVector",
    "AngularGauge",
    "Animate",
    "AnimatedImage",
    "AnimationCycleOffset",
    "AnimationCycleRepetitions",
    "AnimationDirection",
    "AnimationDisplayTime",
    "AnimationRate",
    "AnimationRepetitions",
    "AnimationRunning",
    "AnimationRunTime",
    "AnimationTimeIndex",
    "AnimationVideo",
    "Animator",
    "AnimatorBox",
    "AnimatorBoxOptions",
    "AnimatorElements",
    "Annotate",
    "Annotation",
    "AnnotationDelete",
    "AnnotationKeys",
    "AnnotationRules",
    "AnnotationValue",
    "Annuity",
    "AnnuityDue",
    "Annulus",
    "AnomalyDetection",
    "AnomalyDetector",
    "AnomalyDetectorFunction",
    "Anonymous",
    "Antialiasing",
    "Antihermitian",
    "AntihermitianMatrixQ",
    "Antisymmetric",
    "AntisymmetricMatrixQ",
    "Antonyms",
    "AnyOrder",
    "AnySubset",
    "AnyTrue",
    "Apart",
    "ApartSquareFree",
    "APIFunction",
    "Appearance",
    "AppearanceElements",
    "AppearanceRules",
    "AppellF1",
    "Append",
    "AppendCheck",
    "AppendLayer",
    "AppendTo",
    "Application",
    "Apply",
    "ApplyReaction",
    "ApplySides",
    "ApplyTo",
    "ArcCos",
    "ArcCosh",
    "ArcCot",
    "ArcCoth",
    "ArcCsc",
    "ArcCsch",
    "ArcCurvature",
    "ARCHProcess",
    "ArcLength",
    "ArcSec",
    "ArcSech",
    "ArcSin",
    "ArcSinDistribution",
    "ArcSinh",
    "ArcTan",
    "ArcTanh",
    "Area",
    "Arg",
    "ArgMax",
    "ArgMin",
    "ArgumentCountQ",
    "ArgumentsOptions",
    "ARIMAProcess",
    "ArithmeticGeometricMean",
    "ARMAProcess",
    "Around",
    "AroundReplace",
    "ARProcess",
    "Array",
    "ArrayComponents",
    "ArrayDepth",
    "ArrayFilter",
    "ArrayFlatten",
    "ArrayMesh",
    "ArrayPad",
    "ArrayPlot",
    "ArrayPlot3D",
    "ArrayQ",
    "ArrayReduce",
    "ArrayResample",
    "ArrayReshape",
    "ArrayRules",
    "Arrays",
    "Arrow",
    "Arrow3DBox",
    "ArrowBox",
    "Arrowheads",
    "ASATriangle",
    "Ask",
    "AskAppend",
    "AskConfirm",
    "AskDisplay",
    "AskedQ",
    "AskedValue",
    "AskFunction",
    "AskState",
    "AskTemplateDisplay",
    "AspectRatio",
    "AspectRatioFixed",
    "Assert",
    "AssessmentFunction",
    "AssessmentResultObject",
    "AssociateTo",
    "Association",
    "AssociationFormat",
    "AssociationMap",
    "AssociationQ",
    "AssociationThread",
    "AssumeDeterministic",
    "Assuming",
    "Assumptions",
    "AstroAngularSeparation",
    "AstroBackground",
    "AstroCenter",
    "AstroDistance",
    "AstroGraphics",
    "AstroGridLines",
    "AstroGridLinesStyle",
    "AstronomicalData",
    "AstroPosition",
    "AstroProjection",
    "AstroRange",
    "AstroRangePadding",
    "AstroReferenceFrame",
    "AstroStyling",
    "AstroZoomLevel",
    "Asymptotic",
    "AsymptoticDSolveValue",
    "AsymptoticEqual",
    "AsymptoticEquivalent",
    "AsymptoticExpectation",
    "AsymptoticGreater",
    "AsymptoticGreaterEqual",
    "AsymptoticIntegrate",
    "AsymptoticLess",
    "AsymptoticLessEqual",
    "AsymptoticOutputTracker",
    "AsymptoticProbability",
    "AsymptoticProduct",
    "AsymptoticRSolveValue",
    "AsymptoticSolve",
    "AsymptoticSum",
    "Asynchronous",
    "AsynchronousTaskObject",
    "AsynchronousTasks",
    "Atom",
    "AtomCoordinates",
    "AtomCount",
    "AtomDiagramCoordinates",
    "AtomLabels",
    "AtomLabelStyle",
    "AtomList",
    "AtomQ",
    "AttachCell",
    "AttachedCell",
    "AttentionLayer",
    "Attributes",
    "Audio",
    "AudioAmplify",
    "AudioAnnotate",
    "AudioAnnotationLookup",
    "AudioBlockMap",
    "AudioCapture",
    "AudioChannelAssignment",
    "AudioChannelCombine",
    "AudioChannelMix",
    "AudioChannels",
    "AudioChannelSeparate",
    "AudioData",
    "AudioDelay",
    "AudioDelete",
    "AudioDevice",
    "AudioDistance",
    "AudioEncoding",
    "AudioFade",
    "AudioFrequencyShift",
    "AudioGenerator",
    "AudioIdentify",
    "AudioInputDevice",
    "AudioInsert",
    "AudioInstanceQ",
    "AudioIntervals",
    "AudioJoin",
    "AudioLabel",
    "AudioLength",
    "AudioLocalMeasurements",
    "AudioLooping",
    "AudioLoudness",
    "AudioMeasurements",
    "AudioNormalize",
    "AudioOutputDevice",
    "AudioOverlay",
    "AudioPad",
    "AudioPan",
    "AudioPartition",
    "AudioPause",
    "AudioPitchShift",
    "AudioPlay",
    "AudioPlot",
    "AudioQ",
    "AudioRecord",
    "AudioReplace",
    "AudioResample",
    "AudioReverb",
    "AudioReverse",
    "AudioSampleRate",
    "AudioSpectralMap",
    "AudioSpectralTransformation",
    "AudioSplit",
    "AudioStop",
    "AudioStream",
    "AudioStreams",
    "AudioTimeStretch",
    "AudioTrackApply",
    "AudioTrackSelection",
    "AudioTrim",
    "AudioType",
    "AugmentedPolyhedron",
    "AugmentedSymmetricPolynomial",
    "Authenticate",
    "Authentication",
    "AuthenticationDialog",
    "AutoAction",
    "Autocomplete",
    "AutocompletionFunction",
    "AutoCopy",
    "AutocorrelationTest",
    "AutoDelete",
    "AutoEvaluateEvents",
    "AutoGeneratedPackage",
    "AutoIndent",
    "AutoIndentSpacings",
    "AutoItalicWords",
    "AutoloadPath",
    "AutoMatch",
    "Automatic",
    "AutomaticImageSize",
    "AutoMultiplicationSymbol",
    "AutoNumberFormatting",
    "AutoOpenNotebooks",
    "AutoOpenPalettes",
    "AutoOperatorRenderings",
    "AutoQuoteCharacters",
    "AutoRefreshed",
    "AutoRemove",
    "AutorunSequencing",
    "AutoScaling",
    "AutoScroll",
    "AutoSpacing",
    "AutoStyleOptions",
    "AutoStyleWords",
    "AutoSubmitting",
    "Axes",
    "AxesEdge",
    "AxesLabel",
    "AxesOrigin",
    "AxesStyle",
    "AxiomaticTheory",
    "Axis",
    "Axis3DBox",
    "Axis3DBoxOptions",
    "AxisBox",
    "AxisBoxOptions",
    "AxisLabel",
    "AxisObject",
    "AxisStyle",
    "BabyMonsterGroupB",
    "Back",
    "BackFaceColor",
    "BackFaceGlowColor",
    "BackFaceOpacity",
    "BackFaceSpecularColor",
    "BackFaceSpecularExponent",
    "BackFaceSurfaceAppearance",
    "BackFaceTexture",
    "Background",
    "BackgroundAppearance",
    "BackgroundTasksSettings",
    "Backslash",
    "Backsubstitution",
    "Backward",
    "Ball",
    "Band",
    "BandpassFilter",
    "BandstopFilter",
    "BarabasiAlbertGraphDistribution",
    "BarChart",
    "BarChart3D",
    "BarcodeImage",
    "BarcodeRecognize",
    "BaringhausHenzeTest",
    "BarLegend",
    "BarlowProschanImportance",
    "BarnesG",
    "BarOrigin",
    "BarSpacing",
    "BartlettHannWindow",
    "BartlettWindow",
    "BaseDecode",
    "BaseEncode",
    "BaseForm",
    "Baseline",
    "BaselinePosition",
    "BaseStyle",
    "BasicRecurrentLayer",
    "BatchNormalizationLayer",
    "BatchSize",
    "BatesDistribution",
    "BattleLemarieWavelet",
    "BayesianMaximization",
    "BayesianMaximizationObject",
    "BayesianMinimization",
    "BayesianMinimizationObject",
    "Because",
    "BeckmannDistribution",
    "Beep",
    "Before",
    "Begin",
    "BeginDialogPacket",
    "BeginPackage",
    "BellB",
    "BellY",
    "Below",
    "BenfordDistribution",
    "BeniniDistribution",
    "BenktanderGibratDistribution",
    "BenktanderWeibullDistribution",
    "BernoulliB",
    "BernoulliDistribution",
    "BernoulliGraphDistribution",
    "BernoulliProcess",
    "BernsteinBasis",
    "BesagL",
    "BesselFilterModel",
    "BesselI",
    "BesselJ",
    "BesselJZero",
    "BesselK",
    "BesselY",
    "BesselYZero",
    "Beta",
    "BetaBinomialDistribution",
    "BetaDistribution",
    "BetaNegativeBinomialDistribution",
    "BetaPrimeDistribution",
    "BetaRegularized",
    "Between",
    "BetweennessCentrality",
    "Beveled",
    "BeveledPolyhedron",
    "BezierCurve",
    "BezierCurve3DBox",
    "BezierCurve3DBoxOptions",
    "BezierCurveBox",
    "BezierCurveBoxOptions",
    "BezierFunction",
    "BilateralFilter",
    "BilateralLaplaceTransform",
    "BilateralZTransform",
    "Binarize",
    "BinaryDeserialize",
    "BinaryDistance",
    "BinaryFormat",
    "BinaryImageQ",
    "BinaryRead",
    "BinaryReadList",
    "BinarySerialize",
    "BinaryWrite",
    "BinCounts",
    "BinLists",
    "BinnedVariogramList",
    "Binomial",
    "BinomialDistribution",
    "BinomialPointProcess",
    "BinomialProcess",
    "BinormalDistribution",
    "BiorthogonalSplineWavelet",
    "BioSequence",
    "BioSequenceBackTranslateList",
    "BioSequenceComplement",
    "BioSequenceInstances",
    "BioSequenceModify",
    "BioSequencePlot",
    "BioSequenceQ",
    "BioSequenceReverseComplement",
    "BioSequenceTranscribe",
    "BioSequenceTranslate",
    "BipartiteGraphQ",
    "BiquadraticFilterModel",
    "BirnbaumImportance",
    "BirnbaumSaundersDistribution",
    "BitAnd",
    "BitClear",
    "BitGet",
    "BitLength",
    "BitNot",
    "BitOr",
    "BitRate",
    "BitSet",
    "BitShiftLeft",
    "BitShiftRight",
    "BitXor",
    "BiweightLocation",
    "BiweightMidvariance",
    "Black",
    "BlackmanHarrisWindow",
    "BlackmanNuttallWindow",
    "BlackmanWindow",
    "Blank",
    "BlankForm",
    "BlankNullSequence",
    "BlankSequence",
    "Blend",
    "Block",
    "BlockchainAddressData",
    "BlockchainBase",
    "BlockchainBlockData",
    "BlockchainContractValue",
    "BlockchainData",
    "BlockchainGet",
    "BlockchainKeyEncode",
    "BlockchainPut",
    "BlockchainTokenData",
    "BlockchainTransaction",
    "BlockchainTransactionData",
    "BlockchainTransactionSign",
    "BlockchainTransactionSubmit",
    "BlockDiagonalMatrix",
    "BlockLowerTriangularMatrix",
    "BlockMap",
    "BlockRandom",
    "BlockUpperTriangularMatrix",
    "BlomqvistBeta",
    "BlomqvistBetaTest",
    "Blue",
    "Blur",
    "Blurring",
    "BodePlot",
    "BohmanWindow",
    "Bold",
    "Bond",
    "BondCount",
    "BondLabels",
    "BondLabelStyle",
    "BondList",
    "BondQ",
    "Bookmarks",
    "Boole",
    "BooleanConsecutiveFunction",
    "BooleanConvert",
    "BooleanCountingFunction",
    "BooleanFunction",
    "BooleanGraph",
    "BooleanMaxterms",
    "BooleanMinimize",
    "BooleanMinterms",
    "BooleanQ",
    "BooleanRegion",
    "Booleans",
    "BooleanStrings",
    "BooleanTable",
    "BooleanVariables",
    "BorderDimensions",
    "BorelTannerDistribution",
    "Bottom",
    "BottomHatTransform",
    "BoundaryDiscretizeGraphics",
    "BoundaryDiscretizeRegion",
    "BoundaryMesh",
    "BoundaryMeshRegion",
    "BoundaryMeshRegionQ",
    "BoundaryStyle",
    "BoundedRegionQ",
    "BoundingRegion",
    "Bounds",
    "Box",
    "BoxBaselineShift",
    "BoxData",
    "BoxDimensions",
    "Boxed",
    "Boxes",
    "BoxForm",
    "BoxFormFormatTypes",
    "BoxFrame",
    "BoxID",
    "BoxMargins",
    "BoxMatrix",
    "BoxObject",
    "BoxRatios",
    "BoxRotation",
    "BoxRotationPoint",
    "BoxStyle",
    "BoxWhiskerChart",
    "Bra",
    "BracketingBar",
    "BraKet",
    "BrayCurtisDistance",
    "BreadthFirstScan",
    "Break",
    "BridgeData",
    "BrightnessEqualize",
    "BroadcastStationData",
    "Brown",
    "BrownForsytheTest",
    "BrownianBridgeProcess",
    "BrowserCategory",
    "BSplineBasis",
    "BSplineCurve",
    "BSplineCurve3DBox",
    "BSplineCurve3DBoxOptions",
    "BSplineCurveBox",
    "BSplineCurveBoxOptions",
    "BSplineFunction",
    "BSplineSurface",
    "BSplineSurface3DBox",
    "BSplineSurface3DBoxOptions",
    "BubbleChart",
    "BubbleChart3D",
    "BubbleScale",
    "BubbleSizes",
    "BuckyballGraph",
    "BuildCompiledComponent",
    "BuildingData",
    "BulletGauge",
    "BusinessDayQ",
    "ButterflyGraph",
    "ButterworthFilterModel",
    "Button",
    "ButtonBar",
    "ButtonBox",
    "ButtonBoxOptions",
    "ButtonCell",
    "ButtonContents",
    "ButtonData",
    "ButtonEvaluator",
    "ButtonExpandable",
    "ButtonFrame",
    "ButtonFunction",
    "ButtonMargins",
    "ButtonMinHeight",
    "ButtonNote",
    "ButtonNotebook",
    "ButtonSource",
    "ButtonStyle",
    "ButtonStyleMenuListing",
    "Byte",
    "ByteArray",
    "ByteArrayFormat",
    "ByteArrayFormatQ",
    "ByteArrayQ",
    "ByteArrayToString",
    "ByteCount",
    "ByteOrdering",
    "C",
    "CachedValue",
    "CacheGraphics",
    "CachePersistence",
    "CalendarConvert",
    "CalendarData",
    "CalendarType",
    "Callout",
    "CalloutMarker",
    "CalloutStyle",
    "CallPacket",
    "CanberraDistance",
    "Cancel",
    "CancelButton",
    "CandlestickChart",
    "CanonicalGraph",
    "CanonicalizePolygon",
    "CanonicalizePolyhedron",
    "CanonicalizeRegion",
    "CanonicalName",
    "CanonicalWarpingCorrespondence",
    "CanonicalWarpingDistance",
    "CantorMesh",
    "CantorStaircase",
    "Canvas",
    "Cap",
    "CapForm",
    "CapitalDifferentialD",
    "Capitalize",
    "CapsuleShape",
    "CaptureRunning",
    "CaputoD",
    "CardinalBSplineBasis",
    "CarlemanLinearize",
    "CarlsonRC",
    "CarlsonRD",
    "CarlsonRE",
    "CarlsonRF",
    "CarlsonRG",
    "CarlsonRJ",
    "CarlsonRK",
    "CarlsonRM",
    "CarmichaelLambda",
    "CaseOrdering",
    "Cases",
    "CaseSensitive",
    "Cashflow",
    "Casoratian",
    "Cast",
    "Catalan",
    "CatalanNumber",
    "Catch",
    "CategoricalDistribution",
    "Catenate",
    "CatenateLayer",
    "CauchyDistribution",
    "CauchyMatrix",
    "CauchyPointProcess",
    "CauchyWindow",
    "CayleyGraph",
    "CDF",
    "CDFDeploy",
    "CDFInformation",
    "CDFWavelet",
    "Ceiling",
    "CelestialSystem",
    "Cell",
    "CellAutoOverwrite",
    "CellBaseline",
    "CellBoundingBox",
    "CellBracketOptions",
    "CellChangeTimes",
    "CellContents",
    "CellContext",
    "CellDingbat",
    "CellDingbatMargin",
    "CellDynamicExpression",
    "CellEditDuplicate",
    "CellElementsBoundingBox",
    "CellElementSpacings",
    "CellEpilog",
    "CellEvaluationDuplicate",
    "CellEvaluationFunction",
    "CellEvaluationLanguage",
    "CellEventActions",
    "CellFrame",
    "CellFrameColor",
    "CellFrameLabelMargins",
    "CellFrameLabels",
    "CellFrameMargins",
    "CellFrameStyle",
    "CellGroup",
    "CellGroupData",
    "CellGrouping",
    "CellGroupingRules",
    "CellHorizontalScrolling",
    "CellID",
    "CellInsertionPointCell",
    "CellLabel",
    "CellLabelAutoDelete",
    "CellLabelMargins",
    "CellLabelPositioning",
    "CellLabelStyle",
    "CellLabelTemplate",
    "CellMargins",
    "CellObject",
    "CellOpen",
    "CellPrint",
    "CellProlog",
    "Cells",
    "CellSize",
    "CellStyle",
    "CellTags",
    "CellTrayPosition",
    "CellTrayWidgets",
    "CellularAutomaton",
    "CensoredDistribution",
    "Censoring",
    "Center",
    "CenterArray",
    "CenterDot",
    "CenteredInterval",
    "CentralFeature",
    "CentralMoment",
    "CentralMomentGeneratingFunction",
    "Cepstrogram",
    "CepstrogramArray",
    "CepstrumArray",
    "CForm",
    "ChampernowneNumber",
    "ChangeOptions",
    "ChannelBase",
    "ChannelBrokerAction",
    "ChannelDatabin",
    "ChannelHistoryLength",
    "ChannelListen",
    "ChannelListener",
    "ChannelListeners",
    "ChannelListenerWait",
    "ChannelObject",
    "ChannelPreSendFunction",
    "ChannelReceiverFunction",
    "ChannelSend",
    "ChannelSubscribers",
    "ChanVeseBinarize",
    "Character",
    "CharacterCounts",
    "CharacterEncoding",
    "CharacterEncodingsPath",
    "CharacteristicFunction",
    "CharacteristicPolynomial",
    "CharacterName",
    "CharacterNormalize",
    "CharacterRange",
    "Characters",
    "ChartBaseStyle",
    "ChartElementData",
    "ChartElementDataFunction",
    "ChartElementFunction",
    "ChartElements",
    "ChartLabels",
    "ChartLayout",
    "ChartLegends",
    "ChartStyle",
    "Chebyshev1FilterModel",
    "Chebyshev2FilterModel",
    "ChebyshevDistance",
    "ChebyshevT",
    "ChebyshevU",
    "Check",
    "CheckAbort",
    "CheckAll",
    "CheckArguments",
    "Checkbox",
    "CheckboxBar",
    "CheckboxBox",
    "CheckboxBoxOptions",
    "ChemicalConvert",
    "ChemicalData",
    "ChemicalFormula",
    "ChemicalInstance",
    "ChemicalReaction",
    "ChessboardDistance",
    "ChiDistribution",
    "ChineseRemainder",
    "ChiSquareDistribution",
    "ChoiceButtons",
    "ChoiceDialog",
    "CholeskyDecomposition",
    "Chop",
    "ChromaticityPlot",
    "ChromaticityPlot3D",
    "ChromaticPolynomial",
    "Circle",
    "CircleBox",
    "CircleDot",
    "CircleMinus",
    "CirclePlus",
    "CirclePoints",
    "CircleThrough",
    "CircleTimes",
    "CirculantGraph",
    "CircularArcThrough",
    "CircularOrthogonalMatrixDistribution",
    "CircularQuaternionMatrixDistribution",
    "CircularRealMatrixDistribution",
    "CircularSymplecticMatrixDistribution",
    "CircularUnitaryMatrixDistribution",
    "Circumsphere",
    "CityData",
    "ClassifierFunction",
    "ClassifierInformation",
    "ClassifierMeasurements",
    "ClassifierMeasurementsObject",
    "Classify",
    "ClassPriors",
    "Clear",
    "ClearAll",
    "ClearAttributes",
    "ClearCookies",
    "ClearPermissions",
    "ClearSystemCache",
    "ClebschGordan",
    "ClickPane",
    "ClickToCopy",
    "ClickToCopyEnabled",
    "Clip",
    "ClipboardNotebook",
    "ClipFill",
    "ClippingStyle",
    "ClipPlanes",
    "ClipPlanesStyle",
    "ClipRange",
    "Clock",
    "ClockGauge",
    "ClockwiseContourIntegral",
    "Close",
    "Closed",
    "CloseKernels",
    "ClosenessCentrality",
    "Closing",
    "ClosingAutoSave",
    "ClosingEvent",
    "CloudAccountData",
    "CloudBase",
    "CloudConnect",
    "CloudConnections",
    "CloudDeploy",
    "CloudDirectory",
    "CloudDisconnect",
    "CloudEvaluate",
    "CloudExport",
    "CloudExpression",
    "CloudExpressions",
    "CloudFunction",
    "CloudGet",
    "CloudImport",
    "CloudLoggingData",
    "CloudObject",
    "CloudObjectInformation",
    "CloudObjectInformationData",
    "CloudObjectNameFormat",
    "CloudObjects",
    "CloudObjectURLType",
    "CloudPublish",
    "CloudPut",
    "CloudRenderingMethod",
    "CloudSave",
    "CloudShare",
    "CloudSubmit",
    "CloudSymbol",
    "CloudUnshare",
    "CloudUserID",
    "ClusterClassify",
    "ClusterDissimilarityFunction",
    "ClusteringComponents",
    "ClusteringMeasurements",
    "ClusteringTree",
    "CMYKColor",
    "Coarse",
    "CodeAssistOptions",
    "Coefficient",
    "CoefficientArrays",
    "CoefficientDomain",
    "CoefficientList",
    "CoefficientRules",
    "CoifletWavelet",
    "Collect",
    "CollinearPoints",
    "Colon",
    "ColonForm",
    "ColorBalance",
    "ColorCombine",
    "ColorConvert",
    "ColorCoverage",
    "ColorData",
    "ColorDataFunction",
    "ColorDetect",
    "ColorDistance",
    "ColorFunction",
    "ColorFunctionBinning",
    "ColorFunctionScaling",
    "Colorize",
    "ColorNegate",
    "ColorOutput",
    "ColorProfileData",
    "ColorQ",
    "ColorQuantize",
    "ColorReplace",
    "ColorRules",
    "ColorSelectorSettings",
    "ColorSeparate",
    "ColorSetter",
    "ColorSetterBox",
    "ColorSetterBoxOptions",
    "ColorSlider",
    "ColorsNear",
    "ColorSpace",
    "ColorToneMapping",
    "Column",
    "ColumnAlignments",
    "ColumnBackgrounds",
    "ColumnForm",
    "ColumnLines",
    "ColumnsEqual",
    "ColumnSpacings",
    "ColumnWidths",
    "CombinatorB",
    "CombinatorC",
    "CombinatorI",
    "CombinatorK",
    "CombinatorS",
    "CombinatorW",
    "CombinatorY",
    "CombinedEntityClass",
    "CombinerFunction",
    "CometData",
    "CommonDefaultFormatTypes",
    "Commonest",
    "CommonestFilter",
    "CommonName",
    "CommonUnits",
    "CommunityBoundaryStyle",
    "CommunityGraphPlot",
    "CommunityLabels",
    "CommunityRegionStyle",
    "CompanyData",
    "CompatibleUnitQ",
    "CompilationOptions",
    "CompilationTarget",
    "Compile",
    "Compiled",
    "CompiledCodeFunction",
    "CompiledComponent",
    "CompiledExpressionDeclaration",
    "CompiledFunction",
    "CompiledLayer",
    "CompilerCallback",
    "CompilerEnvironment",
    "CompilerEnvironmentAppend",
    "CompilerEnvironmentAppendTo",
    "CompilerEnvironmentObject",
    "CompilerOptions",
    "Complement",
    "ComplementedEntityClass",
    "CompleteGraph",
    "CompleteGraphQ",
    "CompleteIntegral",
    "CompleteKaryTree",
    "CompletionsListPacket",
    "Complex",
    "ComplexArrayPlot",
    "ComplexContourPlot",
    "Complexes",
    "ComplexExpand",
    "ComplexInfinity",
    "ComplexityFunction",
    "ComplexListPlot",
    "ComplexPlot",
    "ComplexPlot3D",
    "ComplexRegionPlot",
    "ComplexStreamPlot",
    "ComplexVectorPlot",
    "ComponentMeasurements",
    "ComponentwiseContextMenu",
    "Compose",
    "ComposeList",
    "ComposeSeries",
    "CompositeQ",
    "Composition",
    "CompoundElement",
    "CompoundExpression",
    "CompoundPoissonDistribution",
    "CompoundPoissonProcess",
    "CompoundRenewalProcess",
    "Compress",
    "CompressedData",
    "CompressionLevel",
    "ComputeUncertainty",
    "ConcaveHullMesh",
    "Condition",
    "ConditionalExpression",
    "Conditioned",
    "Cone",
    "ConeBox",
    "ConfidenceLevel",
    "ConfidenceRange",
    "ConfidenceTransform",
    "ConfigurationPath",
    "Confirm",
    "ConfirmAssert",
    "ConfirmBy",
    "ConfirmMatch",
    "ConfirmQuiet",
    "ConformationMethod",
    "ConformAudio",
    "ConformImages",
    "Congruent",
    "ConicGradientFilling",
    "ConicHullRegion",
    "ConicHullRegion3DBox",
    "ConicHullRegion3DBoxOptions",
    "ConicHullRegionBox",
    "ConicHullRegionBoxOptions",
    "ConicOptimization",
    "Conjugate",
    "ConjugateTranspose",
    "Conjunction",
    "Connect",
    "ConnectedComponents",
    "ConnectedGraphComponents",
    "ConnectedGraphQ",
    "ConnectedMeshComponents",
    "ConnectedMoleculeComponents",
    "ConnectedMoleculeQ",
    "ConnectionSettings",
    "ConnectLibraryCallbackFunction",
    "ConnectSystemModelComponents",
    "ConnectSystemModelController",
    "ConnesWindow",
    "ConoverTest",
    "ConservativeConvectionPDETerm",
    "ConsoleMessage",
    "Constant",
    "ConstantArray",
    "ConstantArrayLayer",
    "ConstantImage",
    "ConstantPlusLayer",
    "ConstantRegionQ",
    "Constants",
    "ConstantTimesLayer",
    "ConstellationData",
    "ConstrainedMax",
    "ConstrainedMin",
    "Construct",
    "Containing",
    "ContainsAll",
    "ContainsAny",
    "ContainsExactly",
    "ContainsNone",
    "ContainsOnly",
    "ContentDetectorFunction",
    "ContentFieldOptions",
    "ContentLocationFunction",
    "ContentObject",
    "ContentPadding",
    "ContentsBoundingBox",
    "ContentSelectable",
    "ContentSize",
    "Context",
    "ContextMenu",
    "Contexts",
    "ContextToFileName",
    "Continuation",
    "Continue",
    "ContinuedFraction",
    "ContinuedFractionK",
    "ContinuousAction",
    "ContinuousMarkovProcess",
    "ContinuousTask",
    "ContinuousTimeModelQ",
    "ContinuousWaveletData",
    "ContinuousWaveletTransform",
    "ContourDetect",
    "ContourGraphics",
    "ContourIntegral",
    "ContourLabels",
    "ContourLines",
    "ContourPlot",
    "ContourPlot3D",
    "Contours",
    "ContourShading",
    "ContourSmoothing",
    "ContourStyle",
    "ContraharmonicMean",
    "ContrastiveLossLayer",
    "Control",
    "ControlActive",
    "ControlAlignment",
    "ControlGroupContentsBox",
    "ControllabilityGramian",
    "ControllabilityMatrix",
    "ControllableDecomposition",
    "ControllableModelQ",
    "ControllerDuration",
    "ControllerInformation",
    "ControllerInformationData",
    "ControllerLinking",
    "ControllerManipulate",
    "ControllerMethod",
    "ControllerPath",
    "ControllerState",
    "ControlPlacement",
    "ControlsRendering",
    "ControlType",
    "ConvectionPDETerm",
    "Convergents",
    "ConversionOptions",
    "ConversionRules",
    "ConvertToPostScript",
    "ConvertToPostScriptPacket",
    "ConvexHullMesh",
    "ConvexHullRegion",
    "ConvexOptimization",
    "ConvexPolygonQ",
    "ConvexPolyhedronQ",
    "ConvexRegionQ",
    "ConvolutionLayer",
    "Convolve",
    "ConwayGroupCo1",
    "ConwayGroupCo2",
    "ConwayGroupCo3",
    "CookieFunction",
    "Cookies",
    "CoordinateBoundingBox",
    "CoordinateBoundingBoxArray",
    "CoordinateBounds",
    "CoordinateBoundsArray",
    "CoordinateChartData",
    "CoordinatesToolOptions",
    "CoordinateTransform",
    "CoordinateTransformData",
    "CoplanarPoints",
    "CoprimeQ",
    "Coproduct",
    "CopulaDistribution",
    "Copyable",
    "CopyDatabin",
    "CopyDirectory",
    "CopyFile",
    "CopyFunction",
    "CopyTag",
    "CopyToClipboard",
    "CoreNilpotentDecomposition",
    "CornerFilter",
    "CornerNeighbors",
    "Correlation",
    "CorrelationDistance",
    "CorrelationFunction",
    "CorrelationTest",
    "Cos",
    "Cosh",
    "CoshIntegral",
    "CosineDistance",
    "CosineWindow",
    "CosIntegral",
    "Cot",
    "Coth",
    "CoulombF",
    "CoulombG",
    "CoulombH1",
    "CoulombH2",
    "Count",
    "CountDistinct",
    "CountDistinctBy",
    "CounterAssignments",
    "CounterBox",
    "CounterBoxOptions",
    "CounterClockwiseContourIntegral",
    "CounterEvaluator",
    "CounterFunction",
    "CounterIncrements",
    "CounterStyle",
    "CounterStyleMenuListing",
    "CountRoots",
    "CountryData",
    "Counts",
    "CountsBy",
    "Covariance",
    "CovarianceEstimatorFunction",
    "CovarianceFunction",
    "CoxianDistribution",
    "CoxIngersollRossProcess",
    "CoxModel",
    "CoxModelFit",
    "CramerVonMisesTest",
    "CreateArchive",
    "CreateCellID",
    "CreateChannel",
    "CreateCloudExpression",
    "CreateCompilerEnvironment",
    "CreateDatabin",
    "CreateDataStructure",
    "CreateDataSystemModel",
    "CreateDialog",
    "CreateDirectory",
    "CreateDocument",
    "CreateFile",
    "CreateIntermediateDirectories",
    "CreateLicenseEntitlement",
    "CreateManagedLibraryExpression",
    "CreateNotebook",
    "CreatePacletArchive",
    "CreatePalette",
    "CreatePermissionsGroup",
    "CreateScheduledTask",
    "CreateSearchIndex",
    "CreateSystemModel",
    "CreateTemporary",
    "CreateTypeInstance",
    "CreateUUID",
    "CreateWindow",
    "CriterionFunction",
    "CriticalityFailureImportance",
    "CriticalitySuccessImportance",
    "CriticalSection",
    "Cross",
    "CrossEntropyLossLayer",
    "CrossingCount",
    "CrossingDetect",
    "CrossingPolygon",
    "CrossMatrix",
    "Csc",
    "Csch",
    "CSGRegion",
    "CSGRegionQ",
    "CSGRegionTree",
    "CTCLossLayer",
    "Cube",
    "CubeRoot",
    "Cubics",
    "Cuboid",
    "CuboidBox",
    "CuboidBoxOptions",
    "Cumulant",
    "CumulantGeneratingFunction",
    "CumulativeFeatureImpactPlot",
    "Cup",
    "CupCap",
    "Curl",
    "CurlyDoubleQuote",
    "CurlyQuote",
    "CurrencyConvert",
    "CurrentDate",
    "CurrentImage",
    "CurrentNotebookImage",
    "CurrentScreenImage",
    "CurrentValue",
    "Curry",
    "CurryApplied",
    "CurvatureFlowFilter",
    "CurveClosed",
    "Cyan",
    "CycleGraph",
    "CycleIndexPolynomial",
    "Cycles",
    "CyclicGroup",
    "Cyclotomic",
    "Cylinder",
    "CylinderBox",
    "CylinderBoxOptions",
    "CylindricalDecomposition",
    "CylindricalDecompositionFunction",
    "D",
    "DagumDistribution",
    "DamData",
    "DamerauLevenshteinDistance",
    "DampingFactor",
    "Darker",
    "Dashed",
    "Dashing",
    "DatabaseConnect",
    "DatabaseDisconnect",
    "DatabaseReference",
    "Databin",
    "DatabinAdd",
    "DatabinRemove",
    "Databins",
    "DatabinSubmit",
    "DatabinUpload",
    "DataCompression",
    "DataDistribution",
    "DataRange",
    "DataReversed",
    "Dataset",
    "DatasetDisplayPanel",
    "DatasetTheme",
    "DataStructure",
    "DataStructureQ",
    "Date",
    "DateBounds",
    "Dated",
    "DateDelimiters",
    "DateDifference",
    "DatedUnit",
    "DateFormat",
    "DateFunction",
    "DateGranularity",
    "DateHistogram",
    "DateInterval",
    "DateList",
    "DateListLogPlot",
    "DateListPlot",
    "DateListStepPlot",
    "DateObject",
    "DateObjectQ",
    "DateOverlapsQ",
    "DatePattern",
    "DatePlus",
    "DateRange",
    "DateReduction",
    "DateScale",
    "DateSelect",
    "DateString",
    "DateTicksFormat",
    "DateValue",
    "DateWithinQ",
    "DaubechiesWavelet",
    "DavisDistribution",
    "DawsonF",
    "DayCount",
    "DayCountConvention",
    "DayHemisphere",
    "DaylightQ",
    "DayMatchQ",
    "DayName",
    "DayNightTerminator",
    "DayPlus",
    "DayRange",
    "DayRound",
    "DeBruijnGraph",
    "DeBruijnSequence",
    "Debug",
    "DebugTag",
    "Decapitalize",
    "Decimal",
    "DecimalForm",
    "DeclareCompiledComponent",
    "DeclareKnownSymbols",
    "DeclarePackage",
    "Decompose",
    "DeconvolutionLayer",
    "Decrement",
    "Decrypt",
    "DecryptFile",
    "DedekindEta",
    "DeepSpaceProbeData",
    "Default",
    "Default2DTool",
    "Default3DTool",
    "DefaultAttachedCellStyle",
    "DefaultAxesStyle",
    "DefaultBaseStyle",
    "DefaultBoxStyle",
    "DefaultButton",
    "DefaultColor",
    "DefaultControlPlacement",
    "DefaultDockedCellStyle",
    "DefaultDuplicateCellStyle",
    "DefaultDuration",
    "DefaultElement",
    "DefaultFaceGridsStyle",
    "DefaultFieldHintStyle",
    "DefaultFont",
    "DefaultFontProperties",
    "DefaultFormatType",
    "DefaultFrameStyle",
    "DefaultFrameTicksStyle",
    "DefaultGridLinesStyle",
    "DefaultInlineFormatType",
    "DefaultInputFormatType",
    "DefaultLabelStyle",
    "DefaultMenuStyle",
    "DefaultNaturalLanguage",
    "DefaultNewCellStyle",
    "DefaultNewInlineCellStyle",
    "DefaultNotebook",
    "DefaultOptions",
    "DefaultOutputFormatType",
    "DefaultPrintPrecision",
    "DefaultStyle",
    "DefaultStyleDefinitions",
    "DefaultTextFormatType",
    "DefaultTextInlineFormatType",
    "DefaultTicksStyle",
    "DefaultTooltipStyle",
    "DefaultValue",
    "DefaultValues",
    "Defer",
    "DefineExternal",
    "DefineInputStreamMethod",
    "DefineOutputStreamMethod",
    "DefineResourceFunction",
    "Definition",
    "Degree",
    "DegreeCentrality",
    "DegreeGraphDistribution",
    "DegreeLexicographic",
    "DegreeReverseLexicographic",
    "DEigensystem",
    "DEigenvalues",
    "Deinitialization",
    "Del",
    "DelaunayMesh",
    "Delayed",
    "Deletable",
    "Delete",
    "DeleteAdjacentDuplicates",
    "DeleteAnomalies",
    "DeleteBorderComponents",
    "DeleteCases",
    "DeleteChannel",
    "DeleteCloudExpression",
    "DeleteContents",
    "DeleteDirectory",
    "DeleteDuplicates",
    "DeleteDuplicatesBy",
    "DeleteElements",
    "DeleteFile",
    "DeleteMissing",
    "DeleteObject",
    "DeletePermissionsKey",
    "DeleteSearchIndex",
    "DeleteSmallComponents",
    "DeleteStopwords",
    "DeleteWithContents",
    "DeletionWarning",
    "DelimitedArray",
    "DelimitedSequence",
    "Delimiter",
    "DelimiterAutoMatching",
    "DelimiterFlashTime",
    "DelimiterMatching",
    "Delimiters",
    "DeliveryFunction",
    "Dendrogram",
    "Denominator",
    "DensityGraphics",
    "DensityHistogram",
    "DensityPlot",
    "DensityPlot3D",
    "DependentVariables",
    "Deploy",
    "Deployed",
    "Depth",
    "DepthFirstScan",
    "Derivative",
    "DerivativeFilter",
    "DerivativePDETerm",
    "DerivedKey",
    "DescriptorStateSpace",
    "DesignMatrix",
    "DestroyAfterEvaluation",
    "Det",
    "DeviceClose",
    "DeviceConfigure",
    "DeviceExecute",
    "DeviceExecuteAsynchronous",
    "DeviceObject",
    "DeviceOpen",
    "DeviceOpenQ",
    "DeviceRead",
    "DeviceReadBuffer",
    "DeviceReadLatest",
    "DeviceReadList",
    "DeviceReadTimeSeries",
    "Devices",
    "DeviceStreams",
    "DeviceWrite",
    "DeviceWriteBuffer",
    "DGaussianWavelet",
    "DiacriticalPositioning",
    "Diagonal",
    "DiagonalizableMatrixQ",
    "DiagonalMatrix",
    "DiagonalMatrixQ",
    "Dialog",
    "DialogIndent",
    "DialogInput",
    "DialogLevel",
    "DialogNotebook",
    "DialogProlog",
    "DialogReturn",
    "DialogSymbols",
    "Diamond",
    "DiamondMatrix",
    "DiceDissimilarity",
    "DictionaryLookup",
    "DictionaryWordQ",
    "DifferenceDelta",
    "DifferenceOrder",
    "DifferenceQuotient",
    "DifferenceRoot",
    "DifferenceRootReduce",
    "Differences",
    "DifferentialD",
    "DifferentialRoot",
    "DifferentialRootReduce",
    "DifferentiatorFilter",
    "DiffusionPDETerm",
    "DiggleGatesPointProcess",
    "DiggleGrattonPointProcess",
    "DigitalSignature",
    "DigitBlock",
    "DigitBlockMinimum",
    "DigitCharacter",
    "DigitCount",
    "DigitQ",
    "DihedralAngle",
    "DihedralGroup",
    "Dilation",
    "DimensionalCombinations",
    "DimensionalMeshComponents",
    "DimensionReduce",
    "DimensionReducerFunction",
    "DimensionReduction",
    "Dimensions",
    "DiracComb",
    "DiracDelta",
    "DirectedEdge",
    "DirectedEdges",
    "DirectedGraph",
    "DirectedGraphQ",
    "DirectedInfinity",
    "Direction",
    "DirectionalLight",
    "Directive",
    "Directory",
    "DirectoryName",
    "DirectoryQ",
    "DirectoryStack",
    "DirichletBeta",
    "DirichletCharacter",
    "DirichletCondition",
    "DirichletConvolve",
    "DirichletDistribution",
    "DirichletEta",
    "DirichletL",
    "DirichletLambda",
    "DirichletTransform",
    "DirichletWindow",
    "DisableConsolePrintPacket",
    "DisableFormatting",
    "DiscreteAsymptotic",
    "DiscreteChirpZTransform",
    "DiscreteConvolve",
    "DiscreteDelta",
    "DiscreteHadamardTransform",
    "DiscreteIndicator",
    "DiscreteInputOutputModel",
    "DiscreteLimit",
    "DiscreteLQEstimatorGains",
    "DiscreteLQRegulatorGains",
    "DiscreteLyapunovSolve",
    "DiscreteMarkovProcess",
    "DiscreteMaxLimit",
    "DiscreteMinLimit",
    "DiscretePlot",
    "DiscretePlot3D",
    "DiscreteRatio",
    "DiscreteRiccatiSolve",
    "DiscreteShift",
    "DiscreteTimeModelQ",
    "DiscreteUniformDistribution",
    "DiscreteVariables",
    "DiscreteWaveletData",
    "DiscreteWaveletPacketTransform",
    "DiscreteWaveletTransform",
    "DiscretizeGraphics",
    "DiscretizeRegion",
    "Discriminant",
    "DisjointQ",
    "Disjunction",
    "Disk",
    "DiskBox",
    "DiskBoxOptions",
    "DiskMatrix",
    "DiskSegment",
    "Dispatch",
    "DispatchQ",
    "DispersionEstimatorFunction",
    "Display",
    "DisplayAllSteps",
    "DisplayEndPacket",
    "DisplayForm",
    "DisplayFunction",
    "DisplayPacket",
    "DisplayRules",
    "DisplayString",
    "DisplayTemporary",
    "DisplayWith",
    "DisplayWithRef",
    "DisplayWithVariable",
    "DistanceFunction",
    "DistanceMatrix",
    "DistanceTransform",
    "Distribute",
    "Distributed",
    "DistributedContexts",
    "DistributeDefinitions",
    "DistributionChart",
    "DistributionDomain",
    "DistributionFitTest",
    "DistributionParameterAssumptions",
    "DistributionParameterQ",
    "Dithering",
    "Div",
    "Divergence",
    "Divide",
    "DivideBy",
    "Dividers",
    "DivideSides",
    "Divisible",
    "Divisors",
    "DivisorSigma",
    "DivisorSum",
    "DMSList",
    "DMSString",
    "Do",
    "DockedCell",
    "DockedCells",
    "DocumentGenerator",
    "DocumentGeneratorInformation",
    "DocumentGeneratorInformationData",
    "DocumentGenerators",
    "DocumentNotebook",
    "DocumentWeightingRules",
    "Dodecahedron",
    "DomainRegistrationInformation",
    "DominantColors",
    "DominatorTreeGraph",
    "DominatorVertexList",
    "DOSTextFormat",
    "Dot",
    "DotDashed",
    "DotEqual",
    "DotLayer",
    "DotPlusLayer",
    "Dotted",
    "DoubleBracketingBar",
    "DoubleContourIntegral",
    "DoubleDownArrow",
    "DoubleLeftArrow",
    "DoubleLeftRightArrow",
    "DoubleLeftTee",
    "DoubleLongLeftArrow",
    "DoubleLongLeftRightArrow",
    "DoubleLongRightArrow",
    "DoubleRightArrow",
    "DoubleRightTee",
    "DoubleUpArrow",
    "DoubleUpDownArrow",
    "DoubleVerticalBar",
    "DoublyInfinite",
    "Down",
    "DownArrow",
    "DownArrowBar",
    "DownArrowUpArrow",
    "DownLeftRightVector",
    "DownLeftTeeVector",
    "DownLeftVector",
    "DownLeftVectorBar",
    "DownRightTeeVector",
    "DownRightVector",
    "DownRightVectorBar",
    "Downsample",
    "DownTee",
    "DownTeeArrow",
    "DownValues",
    "DownValuesFunction",
    "DragAndDrop",
    "DrawBackFaces",
    "DrawEdges",
    "DrawFrontFaces",
    "DrawHighlighted",
    "DrazinInverse",
    "Drop",
    "DropoutLayer",
    "DropShadowing",
    "DSolve",
    "DSolveChangeVariables",
    "DSolveValue",
    "Dt",
    "DualLinearProgramming",
    "DualPlanarGraph",
    "DualPolyhedron",
    "DualSystemsModel",
    "DumpGet",
    "DumpSave",
    "DuplicateFreeQ",
    "Duration",
    "Dynamic",
    "DynamicBox",
    "DynamicBoxOptions",
    "DynamicEvaluationTimeout",
    "DynamicGeoGraphics",
    "DynamicImage",
    "DynamicLocation",
    "DynamicModule",
    "DynamicModuleBox",
    "DynamicModuleBoxOptions",
    "DynamicModuleParent",
    "DynamicModuleValues",
    "DynamicName",
    "DynamicNamespace",
    "DynamicReference",
    "DynamicSetting",
    "DynamicUpdating",
    "DynamicWrapper",
    "DynamicWrapperBox",
    "DynamicWrapperBoxOptions",
    "E",
    "EarthImpactData",
    "EarthquakeData",
    "EccentricityCentrality",
    "Echo",
    "EchoEvaluation",
    "EchoFunction",
    "EchoLabel",
    "EchoTiming",
    "EclipseType",
    "EdgeAdd",
    "EdgeBetweennessCentrality",
    "EdgeCapacity",
    "EdgeCapForm",
    "EdgeChromaticNumber",
    "EdgeColor",
    "EdgeConnectivity",
    "EdgeContract",
    "EdgeCost",
    "EdgeCount",
    "EdgeCoverQ",
    "EdgeCycleMatrix",
    "EdgeDashing",
    "EdgeDelete",
    "EdgeDetect",
    "EdgeForm",
    "EdgeIndex",
    "EdgeJoinForm",
    "EdgeLabeling",
    "EdgeLabels",
    "EdgeLabelStyle",
    "EdgeList",
    "EdgeOpacity",
    "EdgeQ",
    "EdgeRenderingFunction",
    "EdgeRules",
    "EdgeShapeFunction",
    "EdgeStyle",
    "EdgeTaggedGraph",
    "EdgeTaggedGraphQ",
    "EdgeTags",
    "EdgeThickness",
    "EdgeTransitiveGraphQ",
    "EdgeValueRange",
    "EdgeValueSizes",
    "EdgeWeight",
    "EdgeWeightedGraphQ",
    "Editable",
    "EditButtonSettings",
    "EditCellTagsSettings",
    "EditDistance",
    "EffectiveInterest",
    "Eigensystem",
    "Eigenvalues",
    "EigenvectorCentrality",
    "Eigenvectors",
    "Element",
    "ElementData",
    "ElementwiseLayer",
    "ElidedForms",
    "Eliminate",
    "EliminationOrder",
    "Ellipsoid",
    "EllipticE",
    "EllipticExp",
    "EllipticExpPrime",
    "EllipticF",
    "EllipticFilterModel",
    "EllipticK",
    "EllipticLog",
    "EllipticNomeQ",
    "EllipticPi",
    "EllipticReducedHalfPeriods",
    "EllipticTheta",
    "EllipticThetaPrime",
    "EmbedCode",
    "EmbeddedHTML",
    "EmbeddedService",
    "EmbeddedSQLEntityClass",
    "EmbeddedSQLExpression",
    "EmbeddingLayer",
    "EmbeddingObject",
    "EmitSound",
    "EmphasizeSyntaxErrors",
    "EmpiricalDistribution",
    "Empty",
    "EmptyGraphQ",
    "EmptyRegion",
    "EmptySpaceF",
    "EnableConsolePrintPacket",
    "Enabled",
    "Enclose",
    "Encode",
    "Encrypt",
    "EncryptedObject",
    "EncryptFile",
    "End",
    "EndAdd",
    "EndDialogPacket",
    "EndOfBuffer",
    "EndOfFile",
    "EndOfLine",
    "EndOfString",
    "EndPackage",
    "EngineEnvironment",
    "EngineeringForm",
    "Enter",
    "EnterExpressionPacket",
    "EnterTextPacket",
    "Entity",
    "EntityClass",
    "EntityClassList",
    "EntityCopies",
    "EntityFunction",
    "EntityGroup",
    "EntityInstance",
    "EntityList",
    "EntityPrefetch",
    "EntityProperties",
    "EntityProperty",
    "EntityPropertyClass",
    "EntityRegister",
    "EntityStore",
    "EntityStores",
    "EntityTypeName",
    "EntityUnregister",
    "EntityValue",
    "Entropy",
    "EntropyFilter",
    "Environment",
    "Epilog",
    "EpilogFunction",
    "Equal",
    "EqualColumns",
    "EqualRows",
    "EqualTilde",
    "EqualTo",
    "EquatedTo",
    "Equilibrium",
    "EquirippleFilterKernel",
    "Equivalent",
    "Erf",
    "Erfc",
    "Erfi",
    "ErlangB",
    "ErlangC",
    "ErlangDistribution",
    "Erosion",
    "ErrorBox",
    "ErrorBoxOptions",
    "ErrorNorm",
    "ErrorPacket",
    "ErrorsDialogSettings",
    "EscapeRadius",
    "EstimatedBackground",
    "EstimatedDistribution",
    "EstimatedPointNormals",
    "EstimatedPointProcess",
    "EstimatedProcess",
    "EstimatedVariogramModel",
    "EstimatorGains",
    "EstimatorRegulator",
    "EuclideanDistance",
    "EulerAngles",
    "EulerCharacteristic",
    "EulerE",
    "EulerGamma",
    "EulerianGraphQ",
    "EulerMatrix",
    "EulerPhi",
    "Evaluatable",
    "Evaluate",
    "Evaluated",
    "EvaluatePacket",
    "EvaluateScheduledTask",
    "EvaluationBox",
    "EvaluationCell",
    "EvaluationCompletionAction",
    "EvaluationData",
    "EvaluationElements",
    "EvaluationEnvironment",
    "EvaluationMode",
    "EvaluationMonitor",
    "EvaluationNotebook",
    "EvaluationObject",
    "EvaluationOrder",
    "EvaluationPrivileges",
    "EvaluationRateLimit",
    "Evaluator",
    "EvaluatorNames",
    "EvenQ",
    "EventData",
    "EventEvaluator",
    "EventHandler",
    "EventHandlerTag",
    "EventLabels",
    "EventSeries",
    "ExactBlackmanWindow",
    "ExactNumberQ",
    "ExactRootIsolation",
    "ExampleData",
    "Except",
    "ExcludedContexts",
    "ExcludedForms",
    "ExcludedLines",
    "ExcludedPhysicalQuantities",
    "ExcludePods",
    "Exclusions",
    "ExclusionsStyle",
    "Exists",
    "Exit",
    "ExitDialog",
    "ExoplanetData",
    "Exp",
    "Expand",
    "ExpandAll",
    "ExpandDenominator",
    "ExpandFileName",
    "ExpandNumerator",
    "Expectation",
    "ExpectationE",
    "ExpectedValue",
    "ExpGammaDistribution",
    "ExpIntegralE",
    "ExpIntegralEi",
    "ExpirationDate",
    "Exponent",
    "ExponentFunction",
    "ExponentialDistribution",
    "ExponentialFamily",
    "ExponentialGeneratingFunction",
    "ExponentialMovingAverage",
    "ExponentialPowerDistribution",
    "ExponentPosition",
    "ExponentStep",
    "Export",
    "ExportAutoReplacements",
    "ExportByteArray",
    "ExportForm",
    "ExportPacket",
    "ExportString",
    "Expression",
    "ExpressionCell",
    "ExpressionGraph",
    "ExpressionPacket",
    "ExpressionTree",
    "ExpressionUUID",
    "ExpToTrig",
    "ExtendedEntityClass",
    "ExtendedGCD",
    "Extension",
    "ExtentElementFunction",
    "ExtentMarkers",
    "ExtentSize",
    "ExternalBundle",
    "ExternalCall",
    "ExternalDataCharacterEncoding",
    "ExternalEvaluate",
    "ExternalFunction",
    "ExternalFunctionName",
    "ExternalIdentifier",
    "ExternalObject",
    "ExternalOptions",
    "ExternalSessionObject",
    "ExternalSessions",
    "ExternalStorageBase",
    "ExternalStorageDownload",
    "ExternalStorageGet",
    "ExternalStorageObject",
    "ExternalStoragePut",
    "ExternalStorageUpload",
    "ExternalTypeSignature",
    "ExternalValue",
    "Extract",
    "ExtractArchive",
    "ExtractLayer",
    "ExtractPacletArchive",
    "ExtremeValueDistribution",
    "FaceAlign",
    "FaceForm",
    "FaceGrids",
    "FaceGridsStyle",
    "FaceRecognize",
    "FacialFeatures",
    "Factor",
    "FactorComplete",
    "Factorial",
    "Factorial2",
    "FactorialMoment",
    "FactorialMomentGeneratingFunction",
    "FactorialPower",
    "FactorInteger",
    "FactorList",
    "FactorSquareFree",
    "FactorSquareFreeList",
    "FactorTerms",
    "FactorTermsList",
    "Fail",
    "Failure",
    "FailureAction",
    "FailureDistribution",
    "FailureQ",
    "False",
    "FareySequence",
    "FARIMAProcess",
    "FeatureDistance",
    "FeatureExtract",
    "FeatureExtraction",
    "FeatureExtractor",
    "FeatureExtractorFunction",
    "FeatureImpactPlot",
    "FeatureNames",
    "FeatureNearest",
    "FeatureSpacePlot",
    "FeatureSpacePlot3D",
    "FeatureTypes",
    "FeatureValueDependencyPlot",
    "FeatureValueImpactPlot",
    "FEDisableConsolePrintPacket",
    "FeedbackLinearize",
    "FeedbackSector",
    "FeedbackSectorStyle",
    "FeedbackType",
    "FEEnableConsolePrintPacket",
    "FetalGrowthData",
    "Fibonacci",
    "Fibonorial",
    "FieldCompletionFunction",
    "FieldHint",
    "FieldHintStyle",
    "FieldMasked",
    "FieldSize",
    "File",
    "FileBaseName",
    "FileByteCount",
    "FileConvert",
    "FileDate",
    "FileExistsQ",
    "FileExtension",
    "FileFormat",
    "FileFormatProperties",
    "FileFormatQ",
    "FileHandler",
    "FileHash",
    "FileInformation",
    "FileName",
    "FileNameDepth",
    "FileNameDialogSettings",
    "FileNameDrop",
    "FileNameForms",
    "FileNameJoin",
    "FileNames",
    "FileNameSetter",
    "FileNameSplit",
    "FileNameTake",
    "FileNameToFormatList",
    "FilePrint",
    "FileSize",
    "FileSystemMap",
    "FileSystemScan",
    "FileSystemTree",
    "FileTemplate",
    "FileTemplateApply",
    "FileType",
    "FilledCurve",
    "FilledCurveBox",
    "FilledCurveBoxOptions",
    "FilledTorus",
    "FillForm",
    "Filling",
    "FillingStyle",
    "FillingTransform",
    "FilteredEntityClass",
    "FilterRules",
    "FinancialBond",
    "FinancialData",
    "FinancialDerivative",
    "FinancialIndicator",
    "Find",
    "FindAnomalies",
    "FindArgMax",
    "FindArgMin",
    "FindChannels",
    "FindClique",
    "FindClusters",
    "FindCookies",
    "FindCurvePath",
    "FindCycle",
    "FindDevices",
    "FindDistribution",
    "FindDistributionParameters",
    "FindDivisions",
    "FindEdgeColoring",
    "FindEdgeCover",
    "FindEdgeCut",
    "FindEdgeIndependentPaths",
    "FindEquationalProof",
    "FindEulerianCycle",
    "FindExternalEvaluators",
    "FindFaces",
    "FindFile",
    "FindFit",
    "FindFormula",
    "FindFundamentalCycles",
    "FindGeneratingFunction",
    "FindGeoLocation",
    "FindGeometricConjectures",
    "FindGeometricTransform",
    "FindGraphCommunities",
    "FindGraphIsomorphism",
    "FindGraphPartition",
    "FindHamiltonianCycle",
    "FindHamiltonianPath",
    "FindHiddenMarkovStates",
    "FindImageText",
    "FindIndependentEdgeSet",
    "FindIndependentVertexSet",
    "FindInstance",
    "FindIntegerNullVector",
    "FindIsomers",
    "FindIsomorphicSubgraph",
    "FindKClan",
    "FindKClique",
    "FindKClub",
    "FindKPlex",
    "FindLibrary",
    "FindLinearRecurrence",
    "FindList",
    "FindMatchingColor",
    "FindMaximum",
    "FindMaximumCut",
    "FindMaximumFlow",
    "FindMaxValue",
    "FindMeshDefects",
    "FindMinimum",
    "FindMinimumCostFlow",
    "FindMinimumCut",
    "FindMinValue",
    "FindMoleculeSubstructure",
    "FindPath",
    "FindPeaks",
    "FindPermutation",
    "FindPlanarColoring",
    "FindPointProcessParameters",
    "FindPostmanTour",
    "FindProcessParameters",
    "FindRegionTransform",
    "FindRepeat",
    "FindRoot",
    "FindSequenceFunction",
    "FindSettings",
    "FindShortestPath",
    "FindShortestTour",
    "FindSpanningTree",
    "FindSubgraphIsomorphism",
    "FindSystemModelEquilibrium",
    "FindTextualAnswer",
    "FindThreshold",
    "FindTransientRepeat",
    "FindVertexColoring",
    "FindVertexCover",
    "FindVertexCut",
    "FindVertexIndependentPaths",
    "Fine",
    "FinishDynamic",
    "FiniteAbelianGroupCount",
    "FiniteGroupCount",
    "FiniteGroupData",
    "First",
    "FirstCase",
    "FirstPassageTimeDistribution",
    "FirstPosition",
    "FischerGroupFi22",
    "FischerGroupFi23",
    "FischerGroupFi24Prime",
    "FisherHypergeometricDistribution",
    "FisherRatioTest",
    "FisherZDistribution",
    "Fit",
    "FitAll",
    "FitRegularization",
    "FittedModel",
    "FixedOrder",
    "FixedPoint",
    "FixedPointList",
    "FlashSelection",
    "Flat",
    "FlatShading",
    "Flatten",
    "FlattenAt",
    "FlattenLayer",
    "FlatTopWindow",
    "FlightData",
    "FlipView",
    "Floor",
    "FlowPolynomial",
    "Fold",
    "FoldList",
    "FoldPair",
    "FoldPairList",
    "FoldWhile",
    "FoldWhileList",
    "FollowRedirects",
    "Font",
    "FontColor",
    "FontFamily",
    "FontForm",
    "FontName",
    "FontOpacity",
    "FontPostScriptName",
    "FontProperties",
    "FontReencoding",
    "FontSize",
    "FontSlant",
    "FontSubstitutions",
    "FontTracking",
    "FontVariations",
    "FontWeight",
    "For",
    "ForAll",
    "ForAllType",
    "ForceVersionInstall",
    "Format",
    "FormatRules",
    "FormatType",
    "FormatTypeAutoConvert",
    "FormatValues",
    "FormBox",
    "FormBoxOptions",
    "FormControl",
    "FormFunction",
    "FormLayoutFunction",
    "FormObject",
    "FormPage",
    "FormProtectionMethod",
    "FormTheme",
    "FormulaData",
    "FormulaLookup",
    "FortranForm",
    "Forward",
    "ForwardBackward",
    "ForwardCloudCredentials",
    "Fourier",
    "FourierCoefficient",
    "FourierCosCoefficient",
    "FourierCosSeries",
    "FourierCosTransform",
    "FourierDCT",
    "FourierDCTFilter",
    "FourierDCTMatrix",
    "FourierDST",
    "FourierDSTMatrix",
    "FourierMatrix",
    "FourierParameters",
    "FourierSequenceTransform",
    "FourierSeries",
    "FourierSinCoefficient",
    "FourierSinSeries",
    "FourierSinTransform",
    "FourierTransform",
    "FourierTrigSeries",
    "FoxH",
    "FoxHReduce",
    "FractionalBrownianMotionProcess",
    "FractionalD",
    "FractionalGaussianNoiseProcess",
    "FractionalPart",
    "FractionBox",
    "FractionBoxOptions",
    "FractionLine",
    "Frame",
    "FrameBox",
    "FrameBoxOptions",
    "Framed",
    "FrameInset",
    "FrameLabel",
    "Frameless",
    "FrameListVideo",
    "FrameMargins",
    "FrameRate",
    "FrameStyle",
    "FrameTicks",
    "FrameTicksStyle",
    "FRatioDistribution",
    "FrechetDistribution",
    "FreeQ",
    "FrenetSerretSystem",
    "FrequencySamplingFilterKernel",
    "FresnelC",
    "FresnelF",
    "FresnelG",
    "FresnelS",
    "Friday",
    "FrobeniusNumber",
    "FrobeniusSolve",
    "FromAbsoluteTime",
    "FromCharacterCode",
    "FromCoefficientRules",
    "FromContinuedFraction",
    "FromDate",
    "FromDateString",
    "FromDigits",
    "FromDMS",
    "FromEntity",
    "FromJulianDate",
    "FromLetterNumber",
    "FromPolarCoordinates",
    "FromRawPointer",
    "FromRomanNumeral",
    "FromSphericalCoordinates",
    "FromUnixTime",
    "Front",
    "FrontEndDynamicExpression",
    "FrontEndEventActions",
    "FrontEndExecute",
    "FrontEndObject",
    "FrontEndResource",
    "FrontEndResourceString",
    "FrontEndStackSize",
    "FrontEndToken",
    "FrontEndTokenExecute",
    "FrontEndValueCache",
    "FrontEndVersion",
    "FrontFaceColor",
    "FrontFaceGlowColor",
    "FrontFaceOpacity",
    "FrontFaceSpecularColor",
    "FrontFaceSpecularExponent",
    "FrontFaceSurfaceAppearance",
    "FrontFaceTexture",
    "Full",
    "FullAxes",
    "FullDefinition",
    "FullForm",
    "FullGraphics",
    "FullInformationOutputRegulator",
    "FullOptions",
    "FullRegion",
    "FullSimplify",
    "Function",
    "FunctionAnalytic",
    "FunctionBijective",
    "FunctionCompile",
    "FunctionCompileExport",
    "FunctionCompileExportByteArray",
    "FunctionCompileExportLibrary",
    "FunctionCompileExportString",
    "FunctionContinuous",
    "FunctionConvexity",
    "FunctionDeclaration",
    "FunctionDiscontinuities",
    "FunctionDomain",
    "FunctionExpand",
    "FunctionInjective",
    "FunctionInterpolation",
    "FunctionLayer",
    "FunctionMeromorphic",
    "FunctionMonotonicity",
    "FunctionPeriod",
    "FunctionPoles",
    "FunctionRange",
    "FunctionSign",
    "FunctionSingularities",
    "FunctionSpace",
    "FunctionSurjective",
    "FussellVeselyImportance",
    "GaborFilter",
    "GaborMatrix",
    "GaborWavelet",
    "GainMargins",
    "GainPhaseMargins",
    "GalaxyData",
    "GalleryView",
    "Gamma",
    "GammaDistribution",
    "GammaRegularized",
    "GapPenalty",
    "GARCHProcess",
    "GatedRecurrentLayer",
    "Gather",
    "GatherBy",
    "GaugeFaceElementFunction",
    "GaugeFaceStyle",
    "GaugeFrameElementFunction",
    "GaugeFrameSize",
    "GaugeFrameStyle",
    "GaugeLabels",
    "GaugeMarkers",
    "GaugeStyle",
    "GaussianFilter",
    "GaussianIntegers",
    "GaussianMatrix",
    "GaussianOrthogonalMatrixDistribution",
    "GaussianSymplecticMatrixDistribution",
    "GaussianUnitaryMatrixDistribution",
    "GaussianWindow",
    "GCD",
    "GegenbauerC",
    "General",
    "GeneralizedLinearModelFit",
    "GenerateAsymmetricKeyPair",
    "GenerateConditions",
    "GeneratedAssetFormat",
    "GeneratedAssetLocation",
    "GeneratedCell",
    "GeneratedCellStyles",
    "GeneratedDocumentBinding",
    "GenerateDerivedKey",
    "GenerateDigitalSignature",
    "GenerateDocument",
    "GeneratedParameters",
    "GeneratedQuantityMagnitudes",
    "GenerateFileSignature",
    "GenerateHTTPResponse",
    "GenerateSecuredAuthenticationKey",
    "GenerateSymmetricKey",
    "GeneratingFunction",
    "GeneratorDescription",
    "GeneratorHistoryLength",
    "GeneratorOutputType",
    "Generic",
    "GenericCylindricalDecomposition",
    "GenomeData",
    "GenomeLookup",
    "GeoAntipode",
    "GeoArea",
    "GeoArraySize",
    "GeoBackground",
    "GeoBoundary",
    "GeoBoundingBox",
    "GeoBounds",
    "GeoBoundsRegion",
    "GeoBoundsRegionBoundary",
    "GeoBubbleChart",
    "GeoCenter",
    "GeoCircle",
    "GeoContourPlot",
    "GeoDensityPlot",
    "GeodesicClosing",
    "GeodesicDilation",
    "GeodesicErosion",
    "GeodesicOpening",
    "GeodesicPolyhedron",
    "GeoDestination",
    "GeodesyData",
    "GeoDirection",
    "GeoDisk",
    "GeoDisplacement",
    "GeoDistance",
    "GeoDistanceList",
    "GeoElevationData",
    "GeoEntities",
    "GeoGraphics",
    "GeoGraphPlot",
    "GeoGraphValuePlot",
    "GeogravityModelData",
    "GeoGridDirectionDifference",
    "GeoGridLines",
    "GeoGridLinesStyle",
    "GeoGridPosition",
    "GeoGridRange",
    "GeoGridRangePadding",
    "GeoGridUnitArea",
    "GeoGridUnitDistance",
    "GeoGridVector",
    "GeoGroup",
    "GeoHemisphere",
    "GeoHemisphereBoundary",
    "GeoHistogram",
    "GeoIdentify",
    "GeoImage",
    "GeoLabels",
    "GeoLength",
    "GeoListPlot",
    "GeoLocation",
    "GeologicalPeriodData",
    "GeomagneticModelData",
    "GeoMarker",
    "GeometricAssertion",
    "GeometricBrownianMotionProcess",
    "GeometricDistribution",
    "GeometricMean",
    "GeometricMeanFilter",
    "GeometricOptimization",
    "GeometricScene",
    "GeometricStep",
    "GeometricStylingRules",
    "GeometricTest",
    "GeometricTransformation",
    "GeometricTransformation3DBox",
    "GeometricTransformation3DBoxOptions",
    "GeometricTransformationBox",
    "GeometricTransformationBoxOptions",
    "GeoModel",
    "GeoNearest",
    "GeoOrientationData",
    "GeoPath",
    "GeoPolygon",
    "GeoPosition",
    "GeoPositionENU",
    "GeoPositionXYZ",
    "GeoProjection",
    "GeoProjectionData",
    "GeoRange",
    "GeoRangePadding",
    "GeoRegionValuePlot",
    "GeoResolution",
    "GeoScaleBar",
    "GeoServer",
    "GeoSmoothHistogram",
    "GeoStreamPlot",
    "GeoStyling",
    "GeoStylingImageFunction",
    "GeoVariant",
    "GeoVector",
    "GeoVectorENU",
    "GeoVectorPlot",
    "GeoVectorXYZ",
    "GeoVisibleRegion",
    "GeoVisibleRegionBoundary",
    "GeoWithinQ",
    "GeoZoomLevel",
    "GestureHandler",
    "GestureHandlerTag",
    "Get",
    "GetContext",
    "GetEnvironment",
    "GetFileName",
    "GetLinebreakInformationPacket",
    "GibbsPointProcess",
    "Glaisher",
    "GlobalClusteringCoefficient",
    "GlobalPreferences",
    "GlobalSession",
    "Glow",
    "GoldenAngle",
    "GoldenRatio",
    "GompertzMakehamDistribution",
    "GoochShading",
    "GoodmanKruskalGamma",
    "GoodmanKruskalGammaTest",
    "Goto",
    "GouraudShading",
    "Grad",
    "Gradient",
    "GradientFilter",
    "GradientFittedMesh",
    "GradientOrientationFilter",
    "GrammarApply",
    "GrammarRules",
    "GrammarToken",
    "Graph",
    "Graph3D",
    "GraphAssortativity",
    "GraphAutomorphismGroup",
    "GraphCenter",
    "GraphComplement",
    "GraphData",
    "GraphDensity",
    "GraphDiameter",
    "GraphDifference",
    "GraphDisjointUnion",
    "GraphDistance",
    "GraphDistanceMatrix",
    "GraphEmbedding",
    "GraphHighlight",
    "GraphHighlightStyle",
    "GraphHub",
    "Graphics",
    "Graphics3D",
    "Graphics3DBox",
    "Graphics3DBoxOptions",
    "GraphicsArray",
    "GraphicsBaseline",
    "GraphicsBox",
    "GraphicsBoxOptions",
    "GraphicsColor",
    "GraphicsColumn",
    "GraphicsComplex",
    "GraphicsComplex3DBox",
    "GraphicsComplex3DBoxOptions",
    "GraphicsComplexBox",
    "GraphicsComplexBoxOptions",
    "GraphicsContents",
    "GraphicsData",
    "GraphicsGrid",
    "GraphicsGridBox",
    "GraphicsGroup",
    "GraphicsGroup3DBox",
    "GraphicsGroup3DBoxOptions",
    "GraphicsGroupBox",
    "GraphicsGroupBoxOptions",
    "GraphicsGrouping",
    "GraphicsHighlightColor",
    "GraphicsRow",
    "GraphicsSpacing",
    "GraphicsStyle",
    "GraphIntersection",
    "GraphJoin",
    "GraphLayerLabels",
    "GraphLayers",
    "GraphLayerStyle",
    "GraphLayout",
    "GraphLinkEfficiency",
    "GraphPeriphery",
    "GraphPlot",
    "GraphPlot3D",
    "GraphPower",
    "GraphProduct",
    "GraphPropertyDistribution",
    "GraphQ",
    "GraphRadius",
    "GraphReciprocity",
    "GraphRoot",
    "GraphStyle",
    "GraphSum",
    "GraphTree",
    "GraphUnion",
    "Gray",
    "GrayLevel",
    "Greater",
    "GreaterEqual",
    "GreaterEqualLess",
    "GreaterEqualThan",
    "GreaterFullEqual",
    "GreaterGreater",
    "GreaterLess",
    "GreaterSlantEqual",
    "GreaterThan",
    "GreaterTilde",
    "GreekStyle",
    "Green",
    "GreenFunction",
    "Grid",
    "GridBaseline",
    "GridBox",
    "GridBoxAlignment",
    "GridBoxBackground",
    "GridBoxDividers",
    "GridBoxFrame",
    "GridBoxItemSize",
    "GridBoxItemStyle",
    "GridBoxOptions",
    "GridBoxSpacings",
    "GridCreationSettings",
    "GridDefaultElement",
    "GridElementStyleOptions",
    "GridFrame",
    "GridFrameMargins",
    "GridGraph",
    "GridLines",
    "GridLinesStyle",
    "GridVideo",
    "GroebnerBasis",
    "GroupActionBase",
    "GroupBy",
    "GroupCentralizer",
    "GroupElementFromWord",
    "GroupElementPosition",
    "GroupElementQ",
    "GroupElements",
    "GroupElementToWord",
    "GroupGenerators",
    "Groupings",
    "GroupMultiplicationTable",
    "GroupOpenerColor",
    "GroupOpenerInsideFrame",
    "GroupOrbits",
    "GroupOrder",
    "GroupPageBreakWithin",
    "GroupSetwiseStabilizer",
    "GroupStabilizer",
    "GroupStabilizerChain",
    "GroupTogetherGrouping",
    "GroupTogetherNestedGrouping",
    "GrowCutComponents",
    "Gudermannian",
    "GuidedFilter",
    "GumbelDistribution",
    "HaarWavelet",
    "HadamardMatrix",
    "HalfLine",
    "HalfNormalDistribution",
    "HalfPlane",
    "HalfSpace",
    "HalftoneShading",
    "HamiltonianGraphQ",
    "HammingDistance",
    "HammingWindow",
    "HandlerFunctions",
    "HandlerFunctionsKeys",
    "HankelH1",
    "HankelH2",
    "HankelMatrix",
    "HankelTransform",
    "HannPoissonWindow",
    "HannWindow",
    "HaradaNortonGroupHN",
    "HararyGraph",
    "HardcorePointProcess",
    "HarmonicMean",
    "HarmonicMeanFilter",
    "HarmonicNumber",
    "Hash",
    "HatchFilling",
    "HatchShading",
    "Haversine",
    "HazardFunction",
    "Head",
    "HeadCompose",
    "HeaderAlignment",
    "HeaderBackground",
    "HeaderDisplayFunction",
    "HeaderLines",
    "Headers",
    "HeaderSize",
    "HeaderStyle",
    "Heads",
    "HeatFluxValue",
    "HeatInsulationValue",
    "HeatOutflowValue",
    "HeatRadiationValue",
    "HeatSymmetryValue",
    "HeatTemperatureCondition",
    "HeatTransferPDEComponent",
    "HeatTransferValue",
    "HeavisideLambda",
    "HeavisidePi",
    "HeavisideTheta",
    "HeldGroupHe",
    "HeldPart",
    "HelmholtzPDEComponent",
    "HelpBrowserLookup",
    "HelpBrowserNotebook",
    "HelpBrowserSettings",
    "HelpViewerSettings",
    "Here",
    "HermiteDecomposition",
    "HermiteH",
    "Hermitian",
    "HermitianMatrixQ",
    "HessenbergDecomposition",
    "Hessian",
    "HeunB",
    "HeunBPrime",
    "HeunC",
    "HeunCPrime",
    "HeunD",
    "HeunDPrime",
    "HeunG",
    "HeunGPrime",
    "HeunT",
    "HeunTPrime",
    "HexadecimalCharacter",
    "Hexahedron",
    "HexahedronBox",
    "HexahedronBoxOptions",
    "HiddenItems",
    "HiddenMarkovProcess",
    "HiddenSurface",
    "Highlighted",
    "HighlightGraph",
    "HighlightImage",
    "HighlightMesh",
    "HighlightString",
    "HighpassFilter",
    "HigmanSimsGroupHS",
    "HilbertCurve",
    "HilbertFilter",
    "HilbertMatrix",
    "Histogram",
    "Histogram3D",
    "HistogramDistribution",
    "HistogramList",
    "HistogramPointDensity",
    "HistogramTransform",
    "HistogramTransformInterpolation",
    "HistoricalPeriodData",
    "HitMissTransform",
    "HITSCentrality",
    "HjorthDistribution",
    "HodgeDual",
    "HoeffdingD",
    "HoeffdingDTest",
    "Hold",
    "HoldAll",
    "HoldAllComplete",
    "HoldComplete",
    "HoldFirst",
    "HoldForm",
    "HoldPattern",
    "HoldRest",
    "HolidayCalendar",
    "HomeDirectory",
    "HomePage",
    "Horizontal",
    "HorizontalForm",
    "HorizontalGauge",
    "HorizontalScrollPosition",
    "HornerForm",
    "HostLookup",
    "HotellingTSquareDistribution",
    "HoytDistribution",
    "HTMLSave",
    "HTTPErrorResponse",
    "HTTPRedirect",
    "HTTPRequest",
    "HTTPRequestData",
    "HTTPResponse",
    "Hue",
    "HumanGrowthData",
    "HumpDownHump",
    "HumpEqual",
    "HurwitzLerchPhi",
    "HurwitzZeta",
    "HyperbolicDistribution",
    "HypercubeGraph",
    "HyperexponentialDistribution",
    "Hyperfactorial",
    "Hypergeometric0F1",
    "Hypergeometric0F1Regularized",
    "Hypergeometric1F1",
    "Hypergeometric1F1Regularized",
    "Hypergeometric2F1",
    "Hypergeometric2F1Regularized",
    "HypergeometricDistribution",
    "HypergeometricPFQ",
    "HypergeometricPFQRegularized",
    "HypergeometricU",
    "Hyperlink",
    "HyperlinkAction",
    "HyperlinkCreationSettings",
    "Hyperplane",
    "Hyphenation",
    "HyphenationOptions",
    "HypoexponentialDistribution",
    "HypothesisTestData",
    "I",
    "IconData",
    "Iconize",
    "IconizedObject",
    "IconRules",
    "Icosahedron",
    "Identity",
    "IdentityMatrix",
    "If",
    "IfCompiled",
    "IgnoreCase",
    "IgnoreDiacritics",
    "IgnoreIsotopes",
    "IgnorePunctuation",
    "IgnoreSpellCheck",
    "IgnoreStereochemistry",
    "IgnoringInactive",
    "Im",
    "Image",
    "Image3D",
    "Image3DProjection",
    "Image3DSlices",
    "ImageAccumulate",
    "ImageAdd",
    "ImageAdjust",
    "ImageAlign",
    "ImageApply",
    "ImageApplyIndexed",
    "ImageAspectRatio",
    "ImageAssemble",
    "ImageAugmentationLayer",
    "ImageBoundingBoxes",
    "ImageCache",
    "ImageCacheValid",
    "ImageCapture",
    "ImageCaptureFunction",
    "ImageCases",
    "ImageChannels",
    "ImageClip",
    "ImageCollage",
    "ImageColorSpace",
    "ImageCompose",
    "ImageContainsQ",
    "ImageContents",
    "ImageConvolve",
    "ImageCooccurrence",
    "ImageCorners",
    "ImageCorrelate",
    "ImageCorrespondingPoints",
    "ImageCrop",
    "ImageData",
    "ImageDeconvolve",
    "ImageDemosaic",
    "ImageDifference",
    "ImageDimensions",
    "ImageDisplacements",
    "ImageDistance",
    "ImageEditMode",
    "ImageEffect",
    "ImageExposureCombine",
    "ImageFeatureTrack",
    "ImageFileApply",
    "ImageFileFilter",
    "ImageFileScan",
    "ImageFilter",
    "ImageFocusCombine",
    "ImageForestingComponents",
    "ImageFormattingWidth",
    "ImageForwardTransformation",
    "ImageGraphics",
    "ImageHistogram",
    "ImageIdentify",
    "ImageInstanceQ",
    "ImageKeypoints",
    "ImageLabels",
    "ImageLegends",
    "ImageLevels",
    "ImageLines",
    "ImageMargins",
    "ImageMarker",
    "ImageMarkers",
    "ImageMeasurements",
    "ImageMesh",
    "ImageMultiply",
    "ImageOffset",
    "ImagePad",
    "ImagePadding",
    "ImagePartition",
    "ImagePeriodogram",
    "ImagePerspectiveTransformation",
    "ImagePosition",
    "ImagePreviewFunction",
    "ImagePyramid",
    "ImagePyramidApply",
    "ImageQ",
    "ImageRangeCache",
    "ImageRecolor",
    "ImageReflect",
    "ImageRegion",
    "ImageResize",
    "ImageResolution",
    "ImageRestyle",
    "ImageRotate",
    "ImageRotated",
    "ImageSaliencyFilter",
    "ImageScaled",
    "ImageScan",
    "ImageSize",
    "ImageSizeAction",
    "ImageSizeCache",
    "ImageSizeMultipliers",
    "ImageSizeRaw",
    "ImageStitch",
    "ImageSubtract",
    "ImageTake",
    "ImageTransformation",
    "ImageTrim",
    "ImageType",
    "ImageValue",
    "ImageValuePositions",
    "ImageVectorscopePlot",
    "ImageWaveformPlot",
    "ImagingDevice",
    "ImplicitD",
    "ImplicitRegion",
    "Implies",
    "Import",
    "ImportAutoReplacements",
    "ImportByteArray",
    "ImportedObject",
    "ImportOptions",
    "ImportString",
    "ImprovementImportance",
    "In",
    "Inactivate",
    "Inactive",
    "InactiveStyle",
    "IncidenceGraph",
    "IncidenceList",
    "IncidenceMatrix",
    "IncludeAromaticBonds",
    "IncludeConstantBasis",
    "IncludedContexts",
    "IncludeDefinitions",
    "IncludeDirectories",
    "IncludeFileExtension",
    "IncludeGeneratorTasks",
    "IncludeHydrogens",
    "IncludeInflections",
    "IncludeMetaInformation",
    "IncludePods",
    "IncludeQuantities",
    "IncludeRelatedTables",
    "IncludeSingularSolutions",
    "IncludeSingularTerm",
    "IncludeWindowTimes",
    "Increment",
    "IndefiniteMatrixQ",
    "Indent",
    "IndentingNewlineSpacings",
    "IndentMaxFraction",
    "IndependenceTest",
    "IndependentEdgeSetQ",
    "IndependentPhysicalQuantity",
    "IndependentUnit",
    "IndependentUnitDimension",
    "IndependentVertexSetQ",
    "Indeterminate",
    "IndeterminateThreshold",
    "IndexCreationOptions",
    "Indexed",
    "IndexEdgeTaggedGraph",
    "IndexGraph",
    "IndexTag",
    "Inequality",
    "InertEvaluate",
    "InertExpression",
    "InexactNumberQ",
    "InexactNumbers",
    "InfiniteFuture",
    "InfiniteLine",
    "InfiniteLineThrough",
    "InfinitePast",
    "InfinitePlane",
    "Infinity",
    "Infix",
    "InflationAdjust",
    "InflationMethod",
    "Information",
    "InformationData",
    "InformationDataGrid",
    "Inherited",
    "InheritScope",
    "InhomogeneousPoissonPointProcess",
    "InhomogeneousPoissonProcess",
    "InitialEvaluationHistory",
    "Initialization",
    "InitializationCell",
    "InitializationCellEvaluation",
    "InitializationCellWarning",
    "InitializationObject",
    "InitializationObjects",
    "InitializationValue",
    "Initialize",
    "InitialSeeding",
    "InlineCounterAssignments",
    "InlineCounterIncrements",
    "InlineRules",
    "Inner",
    "InnerPolygon",
    "InnerPolyhedron",
    "Inpaint",
    "Input",
    "InputAliases",
    "InputAssumptions",
    "InputAutoReplacements",
    "InputField",
    "InputFieldBox",
    "InputFieldBoxOptions",
    "InputForm",
    "InputGrouping",
    "InputNamePacket",
    "InputNotebook",
    "InputPacket",
    "InputPorts",
    "InputSettings",
    "InputStream",
    "InputString",
    "InputStringPacket",
    "InputToBoxFormPacket",
    "Insert",
    "InsertionFunction",
    "InsertionPointObject",
    "InsertLinebreaks",
    "InsertResults",
    "Inset",
    "Inset3DBox",
    "Inset3DBoxOptions",
    "InsetBox",
    "InsetBoxOptions",
    "Insphere",
    "Install",
    "InstallService",
    "InstanceNormalizationLayer",
    "InString",
    "Integer",
    "IntegerDigits",
    "IntegerExponent",
    "IntegerLength",
    "IntegerName",
    "IntegerPart",
    "IntegerPartitions",
    "IntegerQ",
    "IntegerReverse",
    "Integers",
    "IntegerString",
    "Integral",
    "Integrate",
    "IntegrateChangeVariables",
    "Interactive",
    "InteractiveTradingChart",
    "InterfaceSwitched",
    "Interlaced",
    "Interleaving",
    "InternallyBalancedDecomposition",
    "InterpolatingFunction",
    "InterpolatingPolynomial",
    "Interpolation",
    "InterpolationOrder",
    "InterpolationPoints",
    "InterpolationPrecision",
    "Interpretation",
    "InterpretationBox",
    "InterpretationBoxOptions",
    "InterpretationFunction",
    "Interpreter",
    "InterpretTemplate",
    "InterquartileRange",
    "Interrupt",
    "InterruptSettings",
    "IntersectedEntityClass",
    "IntersectingQ",
    "Intersection",
    "Interval",
    "IntervalIntersection",
    "IntervalMarkers",
    "IntervalMarkersStyle",
    "IntervalMemberQ",
    "IntervalSlider",
    "IntervalUnion",
    "Into",
    "Inverse",
    "InverseBetaRegularized",
    "InverseBilateralLaplaceTransform",
    "InverseBilateralZTransform",
    "InverseCDF",
    "InverseChiSquareDistribution",
    "InverseContinuousWaveletTransform",
    "InverseDistanceTransform",
    "InverseEllipticNomeQ",
    "InverseErf",
    "InverseErfc",
    "InverseFourier",
    "InverseFourierCosTransform",
    "InverseFourierSequenceTransform",
    "InverseFourierSinTransform",
    "InverseFourierTransform",
    "InverseFunction",
    "InverseFunctions",
    "InverseGammaDistribution",
    "InverseGammaRegularized",
    "InverseGaussianDistribution",
    "InverseGudermannian",
    "InverseHankelTransform",
    "InverseHaversine",
    "InverseImagePyramid",
    "InverseJacobiCD",
    "InverseJacobiCN",
    "InverseJacobiCS",
    "InverseJacobiDC",
    "InverseJacobiDN",
    "InverseJacobiDS",
    "InverseJacobiNC",
    "InverseJacobiND",
    "InverseJacobiNS",
    "InverseJacobiSC",
    "InverseJacobiSD",
    "InverseJacobiSN",
    "InverseLaplaceTransform",
    "InverseMellinTransform",
    "InversePermutation",
    "InverseRadon",
    "InverseRadonTransform",
    "InverseSeries",
    "InverseShortTimeFourier",
    "InverseSpectrogram",
    "InverseSurvivalFunction",
    "InverseTransformedRegion",
    "InverseWaveletTransform",
    "InverseWeierstrassP",
    "InverseWishartMatrixDistribution",
    "InverseZTransform",
    "Invisible",
    "InvisibleApplication",
    "InvisibleTimes",
    "IPAddress",
    "IrreduciblePolynomialQ",
    "IslandData",
    "IsolatingInterval",
    "IsomorphicGraphQ",
    "IsomorphicSubgraphQ",
    "IsotopeData",
    "Italic",
    "Item",
    "ItemAspectRatio",
    "ItemBox",
    "ItemBoxOptions",
    "ItemDisplayFunction",
    "ItemSize",
    "ItemStyle",
    "ItoProcess",
    "JaccardDissimilarity",
    "JacobiAmplitude",
    "Jacobian",
    "JacobiCD",
    "JacobiCN",
    "JacobiCS",
    "JacobiDC",
    "JacobiDN",
    "JacobiDS",
    "JacobiEpsilon",
    "JacobiNC",
    "JacobiND",
    "JacobiNS",
    "JacobiP",
    "JacobiSC",
    "JacobiSD",
    "JacobiSN",
    "JacobiSymbol",
    "JacobiZeta",
    "JacobiZN",
    "JankoGroupJ1",
    "JankoGroupJ2",
    "JankoGroupJ3",
    "JankoGroupJ4",
    "JarqueBeraALMTest",
    "JohnsonDistribution",
    "Join",
    "JoinAcross",
    "Joined",
    "JoinedCurve",
    "JoinedCurveBox",
    "JoinedCurveBoxOptions",
    "JoinForm",
    "JordanDecomposition",
    "JordanModelDecomposition",
    "JulianDate",
    "JuliaSetBoettcher",
    "JuliaSetIterationCount",
    "JuliaSetPlot",
    "JuliaSetPoints",
    "K",
    "KagiChart",
    "KaiserBesselWindow",
    "KaiserWindow",
    "KalmanEstimator",
    "KalmanFilter",
    "KarhunenLoeveDecomposition",
    "KaryTree",
    "KatzCentrality",
    "KCoreComponents",
    "KDistribution",
    "KEdgeConnectedComponents",
    "KEdgeConnectedGraphQ",
    "KeepExistingVersion",
    "KelvinBei",
    "KelvinBer",
    "KelvinKei",
    "KelvinKer",
    "KendallTau",
    "KendallTauTest",
    "KernelConfiguration",
    "KernelExecute",
    "KernelFunction",
    "KernelMixtureDistribution",
    "KernelObject",
    "Kernels",
    "Ket",
    "Key",
    "KeyCollisionFunction",
    "KeyComplement",
    "KeyDrop",
    "KeyDropFrom",
    "KeyExistsQ",
    "KeyFreeQ",
    "KeyIntersection",
    "KeyMap",
    "KeyMemberQ",
    "KeypointStrength",
    "Keys",
    "KeySelect",
    "KeySort",
    "KeySortBy",
    "KeyTake",
    "KeyUnion",
    "KeyValueMap",
    "KeyValuePattern",
    "Khinchin",
    "KillProcess",
    "KirchhoffGraph",
    "KirchhoffMatrix",
    "KleinInvariantJ",
    "KnapsackSolve",
    "KnightTourGraph",
    "KnotData",
    "KnownUnitQ",
    "KochCurve",
    "KolmogorovSmirnovTest",
    "KroneckerDelta",
    "KroneckerModelDecomposition",
    "KroneckerProduct",
    "KroneckerSymbol",
    "KuiperTest",
    "KumaraswamyDistribution",
    "Kurtosis",
    "KuwaharaFilter",
    "KVertexConnectedComponents",
    "KVertexConnectedGraphQ",
    "LABColor",
    "Label",
    "Labeled",
    "LabeledSlider",
    "LabelingFunction",
    "LabelingSize",
    "LabelStyle",
    "LabelVisibility",
    "LaguerreL",
    "LakeData",
    "LambdaComponents",
    "LambertW",
    "LameC",
    "LameCPrime",
    "LameEigenvalueA",
    "LameEigenvalueB",
    "LameS",
    "LameSPrime",
    "LaminaData",
    "LanczosWindow",
    "LandauDistribution",
    "Language",
    "LanguageCategory",
    "LanguageData",
    "LanguageIdentify",
    "LanguageOptions",
    "LaplaceDistribution",
    "LaplaceTransform",
    "Laplacian",
    "LaplacianFilter",
    "LaplacianGaussianFilter",
    "LaplacianPDETerm",
    "Large",
    "Larger",
    "Last",
    "Latitude",
    "LatitudeLongitude",
    "LatticeData",
    "LatticeReduce",
    "Launch",
    "LaunchKernels",
    "LayeredGraphPlot",
    "LayeredGraphPlot3D",
    "LayerSizeFunction",
    "LayoutInformation",
    "LCHColor",
    "LCM",
    "LeaderSize",
    "LeafCount",
    "LeapVariant",
    "LeapYearQ",
    "LearnDistribution",
    "LearnedDistribution",
    "LearningRate",
    "LearningRateMultipliers",
    "LeastSquares",
    "LeastSquaresFilterKernel",
    "Left",
    "LeftArrow",
    "LeftArrowBar",
    "LeftArrowRightArrow",
    "LeftDownTeeVector",
    "LeftDownVector",
    "LeftDownVectorBar",
    "LeftRightArrow",
    "LeftRightVector",
    "LeftTee",
    "LeftTeeArrow",
    "LeftTeeVector",
    "LeftTriangle",
    "LeftTriangleBar",
    "LeftTriangleEqual",
    "LeftUpDownVector",
    "LeftUpTeeVector",
    "LeftUpVector",
    "LeftUpVectorBar",
    "LeftVector",
    "LeftVectorBar",
    "LegendAppearance",
    "Legended",
    "LegendFunction",
    "LegendLabel",
    "LegendLayout",
    "LegendMargins",
    "LegendMarkers",
    "LegendMarkerSize",
    "LegendreP",
    "LegendreQ",
    "LegendreType",
    "Length",
    "LengthWhile",
    "LerchPhi",
    "Less",
    "LessEqual",
    "LessEqualGreater",
    "LessEqualThan",
    "LessFullEqual",
    "LessGreater",
    "LessLess",
    "LessSlantEqual",
    "LessThan",
    "LessTilde",
    "LetterCharacter",
    "LetterCounts",
    "LetterNumber",
    "LetterQ",
    "Level",
    "LeveneTest",
    "LeviCivitaTensor",
    "LevyDistribution",
    "Lexicographic",
    "LexicographicOrder",
    "LexicographicSort",
    "LibraryDataType",
    "LibraryFunction",
    "LibraryFunctionDeclaration",
    "LibraryFunctionError",
    "LibraryFunctionInformation",
    "LibraryFunctionLoad",
    "LibraryFunctionUnload",
    "LibraryLoad",
    "LibraryUnload",
    "LicenseEntitlementObject",
    "LicenseEntitlements",
    "LicenseID",
    "LicensingSettings",
    "LiftingFilterData",
    "LiftingWaveletTransform",
    "LightBlue",
    "LightBrown",
    "LightCyan",
    "Lighter",
    "LightGray",
    "LightGreen",
    "Lighting",
    "LightingAngle",
    "LightMagenta",
    "LightOrange",
    "LightPink",
    "LightPurple",
    "LightRed",
    "LightSources",
    "LightYellow",
    "Likelihood",
    "Limit",
    "LimitsPositioning",
    "LimitsPositioningTokens",
    "LindleyDistribution",
    "Line",
    "Line3DBox",
    "Line3DBoxOptions",
    "LinearFilter",
    "LinearFractionalOptimization",
    "LinearFractionalTransform",
    "LinearGradientFilling",
    "LinearGradientImage",
    "LinearizingTransformationData",
    "LinearLayer",
    "LinearModelFit",
    "LinearOffsetFunction",
    "LinearOptimization",
    "LinearProgramming",
    "LinearRecurrence",
    "LinearSolve",
    "LinearSolveFunction",
    "LineBox",
    "LineBoxOptions",
    "LineBreak",
    "LinebreakAdjustments",
    "LineBreakChart",
    "LinebreakSemicolonWeighting",
    "LineBreakWithin",
    "LineColor",
    "LineGraph",
    "LineIndent",
    "LineIndentMaxFraction",
    "LineIntegralConvolutionPlot",
    "LineIntegralConvolutionScale",
    "LineLegend",
    "LineOpacity",
    "LineSpacing",
    "LineWrapParts",
    "LinkActivate",
    "LinkClose",
    "LinkConnect",
    "LinkConnectedQ",
    "LinkCreate",
    "LinkError",
    "LinkFlush",
    "LinkFunction",
    "LinkHost",
    "LinkInterrupt",
    "LinkLaunch",
    "LinkMode",
    "LinkObject",
    "LinkOpen",
    "LinkOptions",
    "LinkPatterns",
    "LinkProtocol",
    "LinkRankCentrality",
    "LinkRead",
    "LinkReadHeld",
    "LinkReadyQ",
    "Links",
    "LinkService",
    "LinkWrite",
    "LinkWriteHeld",
    "LiouvilleLambda",
    "List",
    "Listable",
    "ListAnimate",
    "ListContourPlot",
    "ListContourPlot3D",
    "ListConvolve",
    "ListCorrelate",
    "ListCurvePathPlot",
    "ListDeconvolve",
    "ListDensityPlot",
    "ListDensityPlot3D",
    "Listen",
    "ListFormat",
    "ListFourierSequenceTransform",
    "ListInterpolation",
    "ListLineIntegralConvolutionPlot",
    "ListLinePlot",
    "ListLinePlot3D",
    "ListLogLinearPlot",
    "ListLogLogPlot",
    "ListLogPlot",
    "ListPicker",
    "ListPickerBox",
    "ListPickerBoxBackground",
    "ListPickerBoxOptions",
    "ListPlay",
    "ListPlot",
    "ListPlot3D",
    "ListPointPlot3D",
    "ListPolarPlot",
    "ListQ",
    "ListSliceContourPlot3D",
    "ListSliceDensityPlot3D",
    "ListSliceVectorPlot3D",
    "ListStepPlot",
    "ListStreamDensityPlot",
    "ListStreamPlot",
    "ListStreamPlot3D",
    "ListSurfacePlot3D",
    "ListVectorDensityPlot",
    "ListVectorDisplacementPlot",
    "ListVectorDisplacementPlot3D",
    "ListVectorPlot",
    "ListVectorPlot3D",
    "ListZTransform",
    "Literal",
    "LiteralSearch",
    "LiteralType",
    "LoadCompiledComponent",
    "LocalAdaptiveBinarize",
    "LocalCache",
    "LocalClusteringCoefficient",
    "LocalEvaluate",
    "LocalizeDefinitions",
    "LocalizeVariables",
    "LocalObject",
    "LocalObjects",
    "LocalResponseNormalizationLayer",
    "LocalSubmit",
    "LocalSymbol",
    "LocalTime",
    "LocalTimeZone",
    "LocationEquivalenceTest",
    "LocationTest",
    "Locator",
    "LocatorAutoCreate",
    "LocatorBox",
    "LocatorBoxOptions",
    "LocatorCentering",
    "LocatorPane",
    "LocatorPaneBox",
    "LocatorPaneBoxOptions",
    "LocatorRegion",
    "Locked",
    "Log",
    "Log10",
    "Log2",
    "LogBarnesG",
    "LogGamma",
    "LogGammaDistribution",
    "LogicalExpand",
    "LogIntegral",
    "LogisticDistribution",
    "LogisticSigmoid",
    "LogitModelFit",
    "LogLikelihood",
    "LogLinearPlot",
    "LogLogisticDistribution",
    "LogLogPlot",
    "LogMultinormalDistribution",
    "LogNormalDistribution",
    "LogPlot",
    "LogRankTest",
    "LogSeriesDistribution",
    "LongEqual",
    "Longest",
    "LongestCommonSequence",
    "LongestCommonSequencePositions",
    "LongestCommonSubsequence",
    "LongestCommonSubsequencePositions",
    "LongestMatch",
    "LongestOrderedSequence",
    "LongForm",
    "Longitude",
    "LongLeftArrow",
    "LongLeftRightArrow",
    "LongRightArrow",
    "LongShortTermMemoryLayer",
    "Lookup",
    "Loopback",
    "LoopFreeGraphQ",
    "Looping",
    "LossFunction",
    "LowerCaseQ",
    "LowerLeftArrow",
    "LowerRightArrow",
    "LowerTriangularize",
    "LowerTriangularMatrix",
    "LowerTriangularMatrixQ",
    "LowpassFilter",
    "LQEstimatorGains",
    "LQGRegulator",
    "LQOutputRegulatorGains",
    "LQRegulatorGains",
    "LUBackSubstitution",
    "LucasL",
    "LuccioSamiComponents",
    "LUDecomposition",
    "LunarEclipse",
    "LUVColor",
    "LyapunovSolve",
    "LyonsGroupLy",
    "MachineID",
    "MachineName",
    "MachineNumberQ",
    "MachinePrecision",
    "MacintoshSystemPageSetup",
    "Magenta",
    "Magnification",
    "Magnify",
    "MailAddressValidation",
    "MailExecute",
    "MailFolder",
    "MailItem",
    "MailReceiverFunction",
    "MailResponseFunction",
    "MailSearch",
    "MailServerConnect",
    "MailServerConnection",
    "MailSettings",
    "MainSolve",
    "MaintainDynamicCaches",
    "Majority",
    "MakeBoxes",
    "MakeExpression",
    "MakeRules",
    "ManagedLibraryExpressionID",
    "ManagedLibraryExpressionQ",
    "MandelbrotSetBoettcher",
    "MandelbrotSetDistance",
    "MandelbrotSetIterationCount",
    "MandelbrotSetMemberQ",
    "MandelbrotSetPlot",
    "MangoldtLambda",
    "ManhattanDistance",
    "Manipulate",
    "Manipulator",
    "MannedSpaceMissionData",
    "MannWhitneyTest",
    "MantissaExponent",
    "Manual",
    "Map",
    "MapAll",
    "MapApply",
    "MapAt",
    "MapIndexed",
    "MAProcess",
    "MapThread",
    "MarchenkoPasturDistribution",
    "MarcumQ",
    "MardiaCombinedTest",
    "MardiaKurtosisTest",
    "MardiaSkewnessTest",
    "MarginalDistribution",
    "MarkovProcessProperties",
    "Masking",
    "MassConcentrationCondition",
    "MassFluxValue",
    "MassImpermeableBoundaryValue",
    "MassOutflowValue",
    "MassSymmetryValue",
    "MassTransferValue",
    "MassTransportPDEComponent",
    "MatchingDissimilarity",
    "MatchLocalNameQ",
    "MatchLocalNames",
    "MatchQ",
    "Material",
    "MaterialShading",
    "MaternPointProcess",
    "MathematicalFunctionData",
    "MathematicaNotation",
    "MathieuC",
    "MathieuCharacteristicA",
    "MathieuCharacteristicB",
    "MathieuCharacteristicExponent",
    "MathieuCPrime",
    "MathieuGroupM11",
    "MathieuGroupM12",
    "MathieuGroupM22",
    "MathieuGroupM23",
    "MathieuGroupM24",
    "MathieuS",
    "MathieuSPrime",
    "MathMLForm",
    "MathMLText",
    "Matrices",
    "MatrixExp",
    "MatrixForm",
    "MatrixFunction",
    "MatrixLog",
    "MatrixNormalDistribution",
    "MatrixPlot",
    "MatrixPower",
    "MatrixPropertyDistribution",
    "MatrixQ",
    "MatrixRank",
    "MatrixTDistribution",
    "Max",
    "MaxBend",
    "MaxCellMeasure",
    "MaxColorDistance",
    "MaxDate",
    "MaxDetect",
    "MaxDisplayedChildren",
    "MaxDuration",
    "MaxExtraBandwidths",
    "MaxExtraConditions",
    "MaxFeatureDisplacement",
    "MaxFeatures",
    "MaxFilter",
    "MaximalBy",
    "Maximize",
    "MaxItems",
    "MaxIterations",
    "MaxLimit",
    "MaxMemoryUsed",
    "MaxMixtureKernels",
    "MaxOverlapFraction",
    "MaxPlotPoints",
    "MaxPoints",
    "MaxRecursion",
    "MaxStableDistribution",
    "MaxStepFraction",
    "MaxSteps",
    "MaxStepSize",
    "MaxTrainingRounds",
    "MaxValue",
    "MaxwellDistribution",
    "MaxWordGap",
    "McLaughlinGroupMcL",
    "Mean",
    "MeanAbsoluteLossLayer",
    "MeanAround",
    "MeanClusteringCoefficient",
    "MeanDegreeConnectivity",
    "MeanDeviation",
    "MeanFilter",
    "MeanGraphDistance",
    "MeanNeighborDegree",
    "MeanPointDensity",
    "MeanShift",
    "MeanShiftFilter",
    "MeanSquaredLossLayer",
    "Median",
    "MedianDeviation",
    "MedianFilter",
    "MedicalTestData",
    "Medium",
    "MeijerG",
    "MeijerGReduce",
    "MeixnerDistribution",
    "MellinConvolve",
    "MellinTransform",
    "MemberQ",
    "MemoryAvailable",
    "MemoryConstrained",
    "MemoryConstraint",
    "MemoryInUse",
    "MengerMesh",
    "Menu",
    "MenuAppearance",
    "MenuCommandKey",
    "MenuEvaluator",
    "MenuItem",
    "MenuList",
    "MenuPacket",
    "MenuSortingValue",
    "MenuStyle",
    "MenuView",
    "Merge",
    "MergeDifferences",
    "MergingFunction",
    "MersennePrimeExponent",
    "MersennePrimeExponentQ",
    "Mesh",
    "MeshCellCentroid",
    "MeshCellCount",
    "MeshCellHighlight",
    "MeshCellIndex",
    "MeshCellLabel",
    "MeshCellMarker",
    "MeshCellMeasure",
    "MeshCellQuality",
    "MeshCells",
    "MeshCellShapeFunction",
    "MeshCellStyle",
    "MeshConnectivityGraph",
    "MeshCoordinates",
    "MeshFunctions",
    "MeshPrimitives",
    "MeshQualityGoal",
    "MeshRange",
    "MeshRefinementFunction",
    "MeshRegion",
    "MeshRegionQ",
    "MeshShading",
    "MeshStyle",
    "Message",
    "MessageDialog",
    "MessageList",
    "MessageName",
    "MessageObject",
    "MessageOptions",
    "MessagePacket",
    "Messages",
    "MessagesNotebook",
    "MetaCharacters",
    "MetaInformation",
    "MeteorShowerData",
    "Method",
    "MethodOptions",
    "MexicanHatWavelet",
    "MeyerWavelet",
    "Midpoint",
    "MIMETypeToFormatList",
    "Min",
    "MinColorDistance",
    "MinDate",
    "MinDetect",
    "MineralData",
    "MinFilter",
    "MinimalBy",
    "MinimalPolynomial",
    "MinimalStateSpaceModel",
    "Minimize",
    "MinimumTimeIncrement",
    "MinIntervalSize",
    "MinkowskiQuestionMark",
    "MinLimit",
    "MinMax",
    "MinorPlanetData",
    "Minors",
    "MinPointSeparation",
    "MinRecursion",
    "MinSize",
    "MinStableDistribution",
    "Minus",
    "MinusPlus",
    "MinValue",
    "Missing",
    "MissingBehavior",
    "MissingDataMethod",
    "MissingDataRules",
    "MissingQ",
    "MissingString",
    "MissingStyle",
    "MissingValuePattern",
    "MissingValueSynthesis",
    "MittagLefflerE",
    "MixedFractionParts",
    "MixedGraphQ",
    "MixedMagnitude",
    "MixedRadix",
    "MixedRadixQuantity",
    "MixedUnit",
    "MixtureDistribution",
    "Mod",
    "Modal",
    "Mode",
    "ModelPredictiveController",
    "Modular",
    "ModularInverse",
    "ModularLambda",
    "Module",
    "Modulus",
    "MoebiusMu",
    "Molecule",
    "MoleculeAlign",
    "MoleculeContainsQ",
    "MoleculeDraw",
    "MoleculeEquivalentQ",
    "MoleculeFreeQ",
    "MoleculeGraph",
    "MoleculeMatchQ",
    "MoleculeMaximumCommonSubstructure",
    "MoleculeModify",
    "MoleculeName",
    "MoleculePattern",
    "MoleculePlot",
    "MoleculePlot3D",
    "MoleculeProperty",
    "MoleculeQ",
    "MoleculeRecognize",
    "MoleculeSubstructureCount",
    "MoleculeValue",
    "Moment",
    "MomentConvert",
    "MomentEvaluate",
    "MomentGeneratingFunction",
    "MomentOfInertia",
    "Monday",
    "Monitor",
    "MonomialList",
    "MonomialOrder",
    "MonsterGroupM",
    "MoonPhase",
    "MoonPosition",
    "MorletWavelet",
    "MorphologicalBinarize",
    "MorphologicalBranchPoints",
    "MorphologicalComponents",
    "MorphologicalEulerNumber",
    "MorphologicalGraph",
    "MorphologicalPerimeter",
    "MorphologicalTransform",
    "MortalityData",
    "Most",
    "MountainData",
    "MouseAnnotation",
    "MouseAppearance",
    "MouseAppearanceTag",
    "MouseButtons",
    "Mouseover",
    "MousePointerNote",
    "MousePosition",
    "MovieData",
    "MovingAverage",
    "MovingMap",
    "MovingMedian",
    "MoyalDistribution",
    "MultiaxisArrangement",
    "Multicolumn",
    "MultiedgeStyle",
    "MultigraphQ",
    "MultilaunchWarning",
    "MultiLetterItalics",
    "MultiLetterStyle",
    "MultilineFunction",
    "Multinomial",
    "MultinomialDistribution",
    "MultinormalDistribution",
    "MultiplicativeOrder",
    "Multiplicity",
    "MultiplySides",
    "MultiscriptBoxOptions",
    "Multiselection",
    "MultivariateHypergeometricDistribution",
    "MultivariatePoissonDistribution",
    "MultivariateTDistribution",
    "N",
    "NakagamiDistribution",
    "NameQ",
    "Names",
    "NamespaceBox",
    "NamespaceBoxOptions",
    "Nand",
    "NArgMax",
    "NArgMin",
    "NBernoulliB",
    "NBodySimulation",
    "NBodySimulationData",
    "NCache",
    "NCaputoD",
    "NDEigensystem",
    "NDEigenvalues",
    "NDSolve",
    "NDSolveValue",
    "Nearest",
    "NearestFunction",
    "NearestMeshCells",
    "NearestNeighborG",
    "NearestNeighborGraph",
    "NearestTo",
    "NebulaData",
    "NeedlemanWunschSimilarity",
    "Needs",
    "Negative",
    "NegativeBinomialDistribution",
    "NegativeDefiniteMatrixQ",
    "NegativeIntegers",
    "NegativelyOrientedPoints",
    "NegativeMultinomialDistribution",
    "NegativeRationals",
    "NegativeReals",
    "NegativeSemidefiniteMatrixQ",
    "NeighborhoodData",
    "NeighborhoodGraph",
    "Nest",
    "NestedGreaterGreater",
    "NestedLessLess",
    "NestedScriptRules",
    "NestGraph",
    "NestList",
    "NestTree",
    "NestWhile",
    "NestWhileList",
    "NetAppend",
    "NetArray",
    "NetArrayLayer",
    "NetBidirectionalOperator",
    "NetChain",
    "NetDecoder",
    "NetDelete",
    "NetDrop",
    "NetEncoder",
    "NetEvaluationMode",
    "NetExternalObject",
    "NetExtract",
    "NetFlatten",
    "NetFoldOperator",
    "NetGANOperator",
    "NetGraph",
    "NetInformation",
    "NetInitialize",
    "NetInsert",
    "NetInsertSharedArrays",
    "NetJoin",
    "NetMapOperator",
    "NetMapThreadOperator",
    "NetMeasurements",
    "NetModel",
    "NetNestOperator",
    "NetPairEmbeddingOperator",
    "NetPort",
    "NetPortGradient",
    "NetPrepend",
    "NetRename",
    "NetReplace",
    "NetReplacePart",
    "NetSharedArray",
    "NetStateObject",
    "NetTake",
    "NetTrain",
    "NetTrainResultsObject",
    "NetUnfold",
    "NetworkPacketCapture",
    "NetworkPacketRecording",
    "NetworkPacketRecordingDuring",
    "NetworkPacketTrace",
    "NeumannValue",
    "NevilleThetaC",
    "NevilleThetaD",
    "NevilleThetaN",
    "NevilleThetaS",
    "NewPrimitiveStyle",
    "NExpectation",
    "Next",
    "NextCell",
    "NextDate",
    "NextPrime",
    "NextScheduledTaskTime",
    "NeymanScottPointProcess",
    "NFractionalD",
    "NHoldAll",
    "NHoldFirst",
    "NHoldRest",
    "NicholsGridLines",
    "NicholsPlot",
    "NightHemisphere",
    "NIntegrate",
    "NMaximize",
    "NMaxValue",
    "NMinimize",
    "NMinValue",
    "NominalScale",
    "NominalVariables",
    "NonAssociative",
    "NoncentralBetaDistribution",
    "NoncentralChiSquareDistribution",
    "NoncentralFRatioDistribution",
    "NoncentralStudentTDistribution",
    "NonCommutativeMultiply",
    "NonConstants",
    "NondimensionalizationTransform",
    "None",
    "NoneTrue",
    "NonlinearModelFit",
    "NonlinearStateSpaceModel",
    "NonlocalMeansFilter",
    "NonNegative",
    "NonNegativeIntegers",
    "NonNegativeRationals",
    "NonNegativeReals",
    "NonPositive",
    "NonPositiveIntegers",
    "NonPositiveRationals",
    "NonPositiveReals",
    "Nor",
    "NorlundB",
    "Norm",
    "Normal",
    "NormalDistribution",
    "NormalGrouping",
    "NormalizationLayer",
    "Normalize",
    "Normalized",
    "NormalizedSquaredEuclideanDistance",
    "NormalMatrixQ",
    "NormalsFunction",
    "NormFunction",
    "Not",
    "NotCongruent",
    "NotCupCap",
    "NotDoubleVerticalBar",
    "Notebook",
    "NotebookApply",
    "NotebookAutoSave",
    "NotebookBrowseDirectory",
    "NotebookClose",
    "NotebookConvertSettings",
    "NotebookCreate",
    "NotebookDefault",
    "NotebookDelete",
    "NotebookDirectory",
    "NotebookDynamicExpression",
    "NotebookEvaluate",
    "NotebookEventActions",
    "NotebookFileName",
    "NotebookFind",
    "NotebookGet",
    "NotebookImport",
    "NotebookInformation",
    "NotebookInterfaceObject",
    "NotebookLocate",
    "NotebookObject",
    "NotebookOpen",
    "NotebookPath",
    "NotebookPrint",
    "NotebookPut",
    "NotebookRead",
    "Notebooks",
    "NotebookSave",
    "NotebookSelection",
    "NotebooksMenu",
    "NotebookTemplate",
    "NotebookWrite",
    "NotElement",
    "NotEqualTilde",
    "NotExists",
    "NotGreater",
    "NotGreaterEqual",
    "NotGreaterFullEqual",
    "NotGreaterGreater",
    "NotGreaterLess",
    "NotGreaterSlantEqual",
    "NotGreaterTilde",
    "Nothing",
    "NotHumpDownHump",
    "NotHumpEqual",
    "NotificationFunction",
    "NotLeftTriangle",
    "NotLeftTriangleBar",
    "NotLeftTriangleEqual",
    "NotLess",
    "NotLessEqual",
    "NotLessFullEqual",
    "NotLessGreater",
    "NotLessLess",
    "NotLessSlantEqual",
    "NotLessTilde",
    "NotNestedGreaterGreater",
    "NotNestedLessLess",
    "NotPrecedes",
    "NotPrecedesEqual",
    "NotPrecedesSlantEqual",
    "NotPrecedesTilde",
    "NotReverseElement",
    "NotRightTriangle",
    "NotRightTriangleBar",
    "NotRightTriangleEqual",
    "NotSquareSubset",
    "NotSquareSubsetEqual",
    "NotSquareSuperset",
    "NotSquareSupersetEqual",
    "NotSubset",
    "NotSubsetEqual",
    "NotSucceeds",
    "NotSucceedsEqual",
    "NotSucceedsSlantEqual",
    "NotSucceedsTilde",
    "NotSuperset",
    "NotSupersetEqual",
    "NotTilde",
    "NotTildeEqual",
    "NotTildeFullEqual",
    "NotTildeTilde",
    "NotVerticalBar",
    "Now",
    "NoWhitespace",
    "NProbability",
    "NProduct",
    "NProductFactors",
    "NRoots",
    "NSolve",
    "NSolveValues",
    "NSum",
    "NSumTerms",
    "NuclearExplosionData",
    "NuclearReactorData",
    "Null",
    "NullRecords",
    "NullSpace",
    "NullWords",
    "Number",
    "NumberCompose",
    "NumberDecompose",
    "NumberDigit",
    "NumberExpand",
    "NumberFieldClassNumber",
    "NumberFieldDiscriminant",
    "NumberFieldFundamentalUnits",
    "NumberFieldIntegralBasis",
    "NumberFieldNormRepresentatives",
    "NumberFieldRegulator",
    "NumberFieldRootsOfUnity",
    "NumberFieldSignature",
    "NumberForm",
    "NumberFormat",
    "NumberLinePlot",
    "NumberMarks",
    "NumberMultiplier",
    "NumberPadding",
    "NumberPoint",
    "NumberQ",
    "NumberSeparator",
    "NumberSigns",
    "NumberString",
    "Numerator",
    "NumeratorDenominator",
    "NumericalOrder",
    "NumericalSort",
    "NumericArray",
    "NumericArrayQ",
    "NumericArrayType",
    "NumericFunction",
    "NumericQ",
    "NuttallWindow",
    "NValues",
    "NyquistGridLines",
    "NyquistPlot",
    "O",
    "ObjectExistsQ",
    "ObservabilityGramian",
    "ObservabilityMatrix",
    "ObservableDecomposition",
    "ObservableModelQ",
    "OceanData",
    "Octahedron",
    "OddQ",
    "Off",
    "Offset",
    "OLEData",
    "On",
    "ONanGroupON",
    "Once",
    "OneIdentity",
    "Opacity",
    "OpacityFunction",
    "OpacityFunctionScaling",
    "Open",
    "OpenAppend",
    "Opener",
    "OpenerBox",
    "OpenerBoxOptions",
    "OpenerView",
    "OpenFunctionInspectorPacket",
    "Opening",
    "OpenRead",
    "OpenSpecialOptions",
    "OpenTemporary",
    "OpenWrite",
    "Operate",
    "OperatingSystem",
    "OperatorApplied",
    "OptimumFlowData",
    "Optional",
    "OptionalElement",
    "OptionInspectorSettings",
    "OptionQ",
    "Options",
    "OptionsPacket",
    "OptionsPattern",
    "OptionValue",
    "OptionValueBox",
    "OptionValueBoxOptions",
    "Or",
    "Orange",
    "Order",
    "OrderDistribution",
    "OrderedQ",
    "Ordering",
    "OrderingBy",
    "OrderingLayer",
    "Orderless",
    "OrderlessPatternSequence",
    "OrdinalScale",
    "OrnsteinUhlenbeckProcess",
    "Orthogonalize",
    "OrthogonalMatrixQ",
    "Out",
    "Outer",
    "OuterPolygon",
    "OuterPolyhedron",
    "OutputAutoOverwrite",
    "OutputControllabilityMatrix",
    "OutputControllableModelQ",
    "OutputForm",
    "OutputFormData",
    "OutputGrouping",
    "OutputMathEditExpression",
    "OutputNamePacket",
    "OutputPorts",
    "OutputResponse",
    "OutputSizeLimit",
    "OutputStream",
    "Over",
    "OverBar",
    "OverDot",
    "Overflow",
    "OverHat",
    "Overlaps",
    "Overlay",
    "OverlayBox",
    "OverlayBoxOptions",
    "OverlayVideo",
    "Overscript",
    "OverscriptBox",
    "OverscriptBoxOptions",
    "OverTilde",
    "OverVector",
    "OverwriteTarget",
    "OwenT",
    "OwnValues",
    "Package",
    "PackingMethod",
    "PackPaclet",
    "PacletDataRebuild",
    "PacletDirectoryAdd",
    "PacletDirectoryLoad",
    "PacletDirectoryRemove",
    "PacletDirectoryUnload",
    "PacletDisable",
    "PacletEnable",
    "PacletFind",
    "PacletFindRemote",
    "PacletInformation",
    "PacletInstall",
    "PacletInstallSubmit",
    "PacletNewerQ",
    "PacletObject",
    "PacletObjectQ",
    "PacletSite",
    "PacletSiteObject",
    "PacletSiteRegister",
    "PacletSites",
    "PacletSiteUnregister",
    "PacletSiteUpdate",
    "PacletSymbol",
    "PacletUninstall",
    "PacletUpdate",
    "PaddedForm",
    "Padding",
    "PaddingLayer",
    "PaddingSize",
    "PadeApproximant",
    "PadLeft",
    "PadRight",
    "PageBreakAbove",
    "PageBreakBelow",
    "PageBreakWithin",
    "PageFooterLines",
    "PageFooters",
    "PageHeaderLines",
    "PageHeaders",
    "PageHeight",
    "PageRankCentrality",
    "PageTheme",
    "PageWidth",
    "Pagination",
    "PairCorrelationG",
    "PairedBarChart",
    "PairedHistogram",
    "PairedSmoothHistogram",
    "PairedTTest",
    "PairedZTest",
    "PaletteNotebook",
    "PalettePath",
    "PalettesMenuSettings",
    "PalindromeQ",
    "Pane",
    "PaneBox",
    "PaneBoxOptions",
    "Panel",
    "PanelBox",
    "PanelBoxOptions",
    "Paneled",
    "PaneSelector",
    "PaneSelectorBox",
    "PaneSelectorBoxOptions",
    "PaperWidth",
    "ParabolicCylinderD",
    "ParagraphIndent",
    "ParagraphSpacing",
    "ParallelArray",
    "ParallelAxisPlot",
    "ParallelCombine",
    "ParallelDo",
    "Parallelepiped",
    "ParallelEvaluate",
    "Parallelization",
    "Parallelize",
    "ParallelKernels",
    "ParallelMap",
    "ParallelNeeds",
    "Parallelogram",
    "ParallelProduct",
    "ParallelSubmit",
    "ParallelSum",
    "ParallelTable",
    "ParallelTry",
    "Parameter",
    "ParameterEstimator",
    "ParameterMixtureDistribution",
    "ParameterVariables",
    "ParametricConvexOptimization",
    "ParametricFunction",
    "ParametricNDSolve",
    "ParametricNDSolveValue",
    "ParametricPlot",
    "ParametricPlot3D",
    "ParametricRampLayer",
    "ParametricRegion",
    "ParentBox",
    "ParentCell",
    "ParentConnect",
    "ParentDirectory",
    "ParentEdgeLabel",
    "ParentEdgeLabelFunction",
    "ParentEdgeLabelStyle",
    "ParentEdgeShapeFunction",
    "ParentEdgeStyle",
    "ParentEdgeStyleFunction",
    "ParentForm",
    "Parenthesize",
    "ParentList",
    "ParentNotebook",
    "ParetoDistribution",
    "ParetoPickandsDistribution",
    "ParkData",
    "Part",
    "PartBehavior",
    "PartialCorrelationFunction",
    "PartialD",
    "ParticleAcceleratorData",
    "ParticleData",
    "Partition",
    "PartitionGranularity",
    "PartitionsP",
    "PartitionsQ",
    "PartLayer",
    "PartOfSpeech",
    "PartProtection",
    "ParzenWindow",
    "PascalDistribution",
    "PassEventsDown",
    "PassEventsUp",
    "Paste",
    "PasteAutoQuoteCharacters",
    "PasteBoxFormInlineCells",
    "PasteButton",
    "Path",
    "PathGraph",
    "PathGraphQ",
    "Pattern",
    "PatternFilling",
    "PatternReaction",
    "PatternSequence",
    "PatternTest",
    "PauliMatrix",
    "PaulWavelet",
    "Pause",
    "PausedTime",
    "PDF",
    "PeakDetect",
    "PeanoCurve",
    "PearsonChiSquareTest",
    "PearsonCorrelationTest",
    "PearsonDistribution",
    "PenttinenPointProcess",
    "PercentForm",
    "PerfectNumber",
    "PerfectNumberQ",
    "PerformanceGoal",
    "Perimeter",
    "PeriodicBoundaryCondition",
    "PeriodicInterpolation",
    "Periodogram",
    "PeriodogramArray",
    "Permanent",
    "Permissions",
    "PermissionsGroup",
    "PermissionsGroupMemberQ",
    "PermissionsGroups",
    "PermissionsKey",
    "PermissionsKeys",
    "PermutationCycles",
    "PermutationCyclesQ",
    "PermutationGroup",
    "PermutationLength",
    "PermutationList",
    "PermutationListQ",
    "PermutationMatrix",
    "PermutationMax",
    "PermutationMin",
    "PermutationOrder",
    "PermutationPower",
    "PermutationProduct",
    "PermutationReplace",
    "Permutations",
    "PermutationSupport",
    "Permute",
    "PeronaMalikFilter",
    "Perpendicular",
    "PerpendicularBisector",
    "PersistenceLocation",
    "PersistenceTime",
    "PersistentObject",
    "PersistentObjects",
    "PersistentSymbol",
    "PersistentValue",
    "PersonData",
    "PERTDistribution",
    "PetersenGraph",
    "PhaseMargins",
    "PhaseRange",
    "PhongShading",
    "PhysicalSystemData",
    "Pi",
    "Pick",
    "PickedElements",
    "PickMode",
    "PIDData",
    "PIDDerivativeFilter",
    "PIDFeedforward",
    "PIDTune",
    "Piecewise",
    "PiecewiseExpand",
    "PieChart",
    "PieChart3D",
    "PillaiTrace",
    "PillaiTraceTest",
    "PingTime",
    "Pink",
    "PitchRecognize",
    "Pivoting",
    "PixelConstrained",
    "PixelValue",
    "PixelValuePositions",
    "Placed",
    "Placeholder",
    "PlaceholderLayer",
    "PlaceholderReplace",
    "Plain",
    "PlanarAngle",
    "PlanarFaceList",
    "PlanarGraph",
    "PlanarGraphQ",
    "PlanckRadiationLaw",
    "PlaneCurveData",
    "PlanetaryMoonData",
    "PlanetData",
    "PlantData",
    "Play",
    "PlaybackSettings",
    "PlayRange",
    "Plot",
    "Plot3D",
    "Plot3Matrix",
    "PlotDivision",
    "PlotJoined",
    "PlotLabel",
    "PlotLabels",
    "PlotLayout",
    "PlotLegends",
    "PlotMarkers",
    "PlotPoints",
    "PlotRange",
    "PlotRangeClipping",
    "PlotRangeClipPlanesStyle",
    "PlotRangePadding",
    "PlotRegion",
    "PlotStyle",
    "PlotTheme",
    "Pluralize",
    "Plus",
    "PlusMinus",
    "Pochhammer",
    "PodStates",
    "PodWidth",
    "Point",
    "Point3DBox",
    "Point3DBoxOptions",
    "PointBox",
    "PointBoxOptions",
    "PointCountDistribution",
    "PointDensity",
    "PointDensityFunction",
    "PointFigureChart",
    "PointLegend",
    "PointLight",
    "PointProcessEstimator",
    "PointProcessFitTest",
    "PointProcessParameterAssumptions",
    "PointProcessParameterQ",
    "PointSize",
    "PointStatisticFunction",
    "PointValuePlot",
    "PoissonConsulDistribution",
    "PoissonDistribution",
    "PoissonPDEComponent",
    "PoissonPointProcess",
    "PoissonProcess",
    "PoissonWindow",
    "PolarAxes",
    "PolarAxesOrigin",
    "PolarGridLines",
    "PolarPlot",
    "PolarTicks",
    "PoleZeroMarkers",
    "PolyaAeppliDistribution",
    "PolyGamma",
    "Polygon",
    "Polygon3DBox",
    "Polygon3DBoxOptions",
    "PolygonalNumber",
    "PolygonAngle",
    "PolygonBox",
    "PolygonBoxOptions",
    "PolygonCoordinates",
    "PolygonDecomposition",
    "PolygonHoleScale",
    "PolygonIntersections",
    "PolygonScale",
    "Polyhedron",
    "PolyhedronAngle",
    "PolyhedronBox",
    "PolyhedronBoxOptions",
    "PolyhedronCoordinates",
    "PolyhedronData",
    "PolyhedronDecomposition",
    "PolyhedronGenus",
    "PolyLog",
    "PolynomialExpressionQ",
    "PolynomialExtendedGCD",
    "PolynomialForm",
    "PolynomialGCD",
    "PolynomialLCM",
    "PolynomialMod",
    "PolynomialQ",
    "PolynomialQuotient",
    "PolynomialQuotientRemainder",
    "PolynomialReduce",
    "PolynomialRemainder",
    "Polynomials",
    "PolynomialSumOfSquaresList",
    "PoolingLayer",
    "PopupMenu",
    "PopupMenuBox",
    "PopupMenuBoxOptions",
    "PopupView",
    "PopupWindow",
    "Position",
    "PositionIndex",
    "PositionLargest",
    "PositionSmallest",
    "Positive",
    "PositiveDefiniteMatrixQ",
    "PositiveIntegers",
    "PositivelyOrientedPoints",
    "PositiveRationals",
    "PositiveReals",
    "PositiveSemidefiniteMatrixQ",
    "PossibleZeroQ",
    "Postfix",
    "PostScript",
    "Power",
    "PowerDistribution",
    "PowerExpand",
    "PowerMod",
    "PowerModList",
    "PowerRange",
    "PowerSpectralDensity",
    "PowersRepresentations",
    "PowerSymmetricPolynomial",
    "Precedence",
    "PrecedenceForm",
    "Precedes",
    "PrecedesEqual",
    "PrecedesSlantEqual",
    "PrecedesTilde",
    "Precision",
    "PrecisionGoal",
    "PreDecrement",
    "Predict",
    "PredictionRoot",
    "PredictorFunction",
    "PredictorInformation",
    "PredictorMeasurements",
    "PredictorMeasurementsObject",
    "PreemptProtect",
    "PreferencesPath",
    "PreferencesSettings",
    "Prefix",
    "PreIncrement",
    "Prepend",
    "PrependLayer",
    "PrependTo",
    "PreprocessingRules",
    "PreserveColor",
    "PreserveImageOptions",
    "Previous",
    "PreviousCell",
    "PreviousDate",
    "PriceGraphDistribution",
    "PrimaryPlaceholder",
    "Prime",
    "PrimeNu",
    "PrimeOmega",
    "PrimePi",
    "PrimePowerQ",
    "PrimeQ",
    "Primes",
    "PrimeZetaP",
    "PrimitivePolynomialQ",
    "PrimitiveRoot",
    "PrimitiveRootList",
    "PrincipalComponents",
    "PrincipalValue",
    "Print",
    "PrintableASCIIQ",
    "PrintAction",
    "PrintForm",
    "PrintingCopies",
    "PrintingOptions",
    "PrintingPageRange",
    "PrintingStartingPageNumber",
    "PrintingStyleEnvironment",
    "Printout3D",
    "Printout3DPreviewer",
    "PrintPrecision",
    "PrintTemporary",
    "Prism",
    "PrismBox",
    "PrismBoxOptions",
    "PrivateCellOptions",
    "PrivateEvaluationOptions",
    "PrivateFontOptions",
    "PrivateFrontEndOptions",
    "PrivateKey",
    "PrivateNotebookOptions",
    "PrivatePaths",
    "Probability",
    "ProbabilityDistribution",
    "ProbabilityPlot",
    "ProbabilityPr",
    "ProbabilityScalePlot",
    "ProbitModelFit",
    "ProcessConnection",
    "ProcessDirectory",
    "ProcessEnvironment",
    "Processes",
    "ProcessEstimator",
    "ProcessInformation",
    "ProcessObject",
    "ProcessParameterAssumptions",
    "ProcessParameterQ",
    "ProcessStateDomain",
    "ProcessStatus",
    "ProcessTimeDomain",
    "Product",
    "ProductDistribution",
    "ProductLog",
    "ProgressIndicator",
    "ProgressIndicatorBox",
    "ProgressIndicatorBoxOptions",
    "ProgressReporting",
    "Projection",
    "Prolog",
    "PromptForm",
    "ProofObject",
    "PropagateAborts",
    "Properties",
    "Property",
    "PropertyList",
    "PropertyValue",
    "Proportion",
    "Proportional",
    "Protect",
    "Protected",
    "ProteinData",
    "Pruning",
    "PseudoInverse",
    "PsychrometricPropertyData",
    "PublicKey",
    "PublisherID",
    "PulsarData",
    "PunctuationCharacter",
    "Purple",
    "Put",
    "PutAppend",
    "Pyramid",
    "PyramidBox",
    "PyramidBoxOptions",
    "QBinomial",
    "QFactorial",
    "QGamma",
    "QHypergeometricPFQ",
    "QnDispersion",
    "QPochhammer",
    "QPolyGamma",
    "QRDecomposition",
    "QuadraticIrrationalQ",
    "QuadraticOptimization",
    "Quantile",
    "QuantilePlot",
    "Quantity",
    "QuantityArray",
    "QuantityDistribution",
    "QuantityForm",
    "QuantityMagnitude",
    "QuantityQ",
    "QuantityUnit",
    "QuantityVariable",
    "QuantityVariableCanonicalUnit",
    "QuantityVariableDimensions",
    "QuantityVariableIdentifier",
    "QuantityVariablePhysicalQuantity",
    "Quartics",
    "QuartileDeviation",
    "Quartiles",
    "QuartileSkewness",
    "Query",
    "QuestionGenerator",
    "QuestionInterface",
    "QuestionObject",
    "QuestionSelector",
    "QueueingNetworkProcess",
    "QueueingProcess",
    "QueueProperties",
    "Quiet",
    "QuietEcho",
    "Quit",
    "Quotient",
    "QuotientRemainder",
    "RadialAxisPlot",
    "RadialGradientFilling",
    "RadialGradientImage",
    "RadialityCentrality",
    "RadicalBox",
    "RadicalBoxOptions",
    "RadioButton",
    "RadioButtonBar",
    "RadioButtonBox",
    "RadioButtonBoxOptions",
    "Radon",
    "RadonTransform",
    "RamanujanTau",
    "RamanujanTauL",
    "RamanujanTauTheta",
    "RamanujanTauZ",
    "Ramp",
    "Random",
    "RandomArrayLayer",
    "RandomChoice",
    "RandomColor",
    "RandomComplex",
    "RandomDate",
    "RandomEntity",
    "RandomFunction",
    "RandomGeneratorState",
    "RandomGeoPosition",
    "RandomGraph",
    "RandomImage",
    "RandomInstance",
    "RandomInteger",
    "RandomPermutation",
    "RandomPoint",
    "RandomPointConfiguration",
    "RandomPolygon",
    "RandomPolyhedron",
    "RandomPrime",
    "RandomReal",
    "RandomSample",
    "RandomSeed",
    "RandomSeeding",
    "RandomTime",
    "RandomTree",
    "RandomVariate",
    "RandomWalkProcess",
    "RandomWord",
    "Range",
    "RangeFilter",
    "RangeSpecification",
    "RankedMax",
    "RankedMin",
    "RarerProbability",
    "Raster",
    "Raster3D",
    "Raster3DBox",
    "Raster3DBoxOptions",
    "RasterArray",
    "RasterBox",
    "RasterBoxOptions",
    "Rasterize",
    "RasterSize",
    "Rational",
    "RationalExpressionQ",
    "RationalFunctions",
    "Rationalize",
    "Rationals",
    "Ratios",
    "RawArray",
    "RawBoxes",
    "RawData",
    "RawMedium",
    "RayleighDistribution",
    "Re",
    "ReactionBalance",
    "ReactionBalancedQ",
    "ReactionPDETerm",
    "Read",
    "ReadByteArray",
    "ReadLine",
    "ReadList",
    "ReadProtected",
    "ReadString",
    "Real",
    "RealAbs",
    "RealBlockDiagonalForm",
    "RealDigits",
    "RealExponent",
    "Reals",
    "RealSign",
    "Reap",
    "RebuildPacletData",
    "RecalibrationFunction",
    "RecognitionPrior",
    "RecognitionThreshold",
    "ReconstructionMesh",
    "Record",
    "RecordLists",
    "RecordSeparators",
    "Rectangle",
    "RectangleBox",
    "RectangleBoxOptions",
    "RectangleChart",
    "RectangleChart3D",
    "RectangularRepeatingElement",
    "RecurrenceFilter",
    "RecurrenceTable",
    "RecurringDigitsForm",
    "Red",
    "Reduce",
    "RefBox",
    "ReferenceLineStyle",
    "ReferenceMarkers",
    "ReferenceMarkerStyle",
    "Refine",
    "ReflectionMatrix",
    "ReflectionTransform",
    "Refresh",
    "RefreshRate",
    "Region",
    "RegionBinarize",
    "RegionBoundary",
    "RegionBoundaryStyle",
    "RegionBounds",
    "RegionCentroid",
    "RegionCongruent",
    "RegionConvert",
    "RegionDifference",
    "RegionDilation",
    "RegionDimension",
    "RegionDisjoint",
    "RegionDistance",
    "RegionDistanceFunction",
    "RegionEmbeddingDimension",
    "RegionEqual",
    "RegionErosion",
    "RegionFillingStyle",
    "RegionFit",
    "RegionFunction",
    "RegionImage",
    "RegionIntersection",
    "RegionMeasure",
    "RegionMember",
    "RegionMemberFunction",
    "RegionMoment",
    "RegionNearest",
    "RegionNearestFunction",
    "RegionPlot",
    "RegionPlot3D",
    "RegionProduct",
    "RegionQ",
    "RegionResize",
    "RegionSimilar",
    "RegionSize",
    "RegionSymmetricDifference",
    "RegionUnion",
    "RegionWithin",
    "RegisterExternalEvaluator",
    "RegularExpression",
    "Regularization",
    "RegularlySampledQ",
    "RegularPolygon",
    "ReIm",
    "ReImLabels",
    "ReImPlot",
    "ReImStyle",
    "Reinstall",
    "RelationalDatabase",
    "RelationGraph",
    "Release",
    "ReleaseHold",
    "ReliabilityDistribution",
    "ReliefImage",
    "ReliefPlot",
    "RemoteAuthorizationCaching",
    "RemoteBatchJobAbort",
    "RemoteBatchJobObject",
    "RemoteBatchJobs",
    "RemoteBatchMapSubmit",
    "RemoteBatchSubmissionEnvironment",
    "RemoteBatchSubmit",
    "RemoteConnect",
    "RemoteConnectionObject",
    "RemoteEvaluate",
    "RemoteFile",
    "RemoteInputFiles",
    "RemoteKernelObject",
    "RemoteProviderSettings",
    "RemoteRun",
    "RemoteRunProcess",
    "RemovalConditions",
    "Remove",
    "RemoveAlphaChannel",
    "RemoveAsynchronousTask",
    "RemoveAudioStream",
    "RemoveBackground",
    "RemoveChannelListener",
    "RemoveChannelSubscribers",
    "Removed",
    "RemoveDiacritics",
    "RemoveInputStreamMethod",
    "RemoveOutputStreamMethod",
    "RemoveProperty",
    "RemoveScheduledTask",
    "RemoveUsers",
    "RemoveVideoStream",
    "RenameDirectory",
    "RenameFile",
    "RenderAll",
    "RenderingOptions",
    "RenewalProcess",
    "RenkoChart",
    "RepairMesh",
    "Repeated",
    "RepeatedNull",
    "RepeatedString",
    "RepeatedTiming",
    "RepeatingElement",
    "Replace",
    "ReplaceAll",
    "ReplaceAt",
    "ReplaceHeldPart",
    "ReplaceImageValue",
    "ReplaceList",
    "ReplacePart",
    "ReplacePixelValue",
    "ReplaceRepeated",
    "ReplicateLayer",
    "RequiredPhysicalQuantities",
    "Resampling",
    "ResamplingAlgorithmData",
    "ResamplingMethod",
    "Rescale",
    "RescalingTransform",
    "ResetDirectory",
    "ResetScheduledTask",
    "ReshapeLayer",
    "Residue",
    "ResidueSum",
    "ResizeLayer",
    "Resolve",
    "ResolveContextAliases",
    "ResourceAcquire",
    "ResourceData",
    "ResourceFunction",
    "ResourceObject",
    "ResourceRegister",
    "ResourceRemove",
    "ResourceSearch",
    "ResourceSubmissionObject",
    "ResourceSubmit",
    "ResourceSystemBase",
    "ResourceSystemPath",
    "ResourceUpdate",
    "ResourceVersion",
    "ResponseForm",
    "Rest",
    "RestartInterval",
    "Restricted",
    "Resultant",
    "ResumePacket",
    "Return",
    "ReturnCreatesNewCell",
    "ReturnEntersInput",
    "ReturnExpressionPacket",
    "ReturnInputFormPacket",
    "ReturnPacket",
    "ReturnReceiptFunction",
    "ReturnTextPacket",
    "Reverse",
    "ReverseApplied",
    "ReverseBiorthogonalSplineWavelet",
    "ReverseElement",
    "ReverseEquilibrium",
    "ReverseGraph",
    "ReverseSort",
    "ReverseSortBy",
    "ReverseUpEquilibrium",
    "RevolutionAxis",
    "RevolutionPlot3D",
    "RGBColor",
    "RiccatiSolve",
    "RiceDistribution",
    "RidgeFilter",
    "RiemannR",
    "RiemannSiegelTheta",
    "RiemannSiegelZ",
    "RiemannXi",
    "Riffle",
    "Right",
    "RightArrow",
    "RightArrowBar",
    "RightArrowLeftArrow",
    "RightComposition",
    "RightCosetRepresentative",
    "RightDownTeeVector",
    "RightDownVector",
    "RightDownVectorBar",
    "RightTee",
    "RightTeeArrow",
    "RightTeeVector",
    "RightTriangle",
    "RightTriangleBar",
    "RightTriangleEqual",
    "RightUpDownVector",
    "RightUpTeeVector",
    "RightUpVector",
    "RightUpVectorBar",
    "RightVector",
    "RightVectorBar",
    "RipleyK",
    "RipleyRassonRegion",
    "RiskAchievementImportance",
    "RiskReductionImportance",
    "RobustConvexOptimization",
    "RogersTanimotoDissimilarity",
    "RollPitchYawAngles",
    "RollPitchYawMatrix",
    "RomanNumeral",
    "Root",
    "RootApproximant",
    "RootIntervals",
    "RootLocusPlot",
    "RootMeanSquare",
    "RootOfUnityQ",
    "RootReduce",
    "Roots",
    "RootSum",
    "RootTree",
    "Rotate",
    "RotateLabel",
    "RotateLeft",
    "RotateRight",
    "RotationAction",
    "RotationBox",
    "RotationBoxOptions",
    "RotationMatrix",
    "RotationTransform",
    "Round",
    "RoundImplies",
    "RoundingRadius",
    "Row",
    "RowAlignments",
    "RowBackgrounds",
    "RowBox",
    "RowHeights",
    "RowLines",
    "RowMinHeight",
    "RowReduce",
    "RowsEqual",
    "RowSpacings",
    "RSolve",
    "RSolveValue",
    "RudinShapiro",
    "RudvalisGroupRu",
    "Rule",
    "RuleCondition",
    "RuleDelayed",
    "RuleForm",
    "RulePlot",
    "RulerUnits",
    "RulesTree",
    "Run",
    "RunProcess",
    "RunScheduledTask",
    "RunThrough",
    "RuntimeAttributes",
    "RuntimeOptions",
    "RussellRaoDissimilarity",
    "SameAs",
    "SameQ",
    "SameTest",
    "SameTestProperties",
    "SampledEntityClass",
    "SampleDepth",
    "SampledSoundFunction",
    "SampledSoundList",
    "SampleRate",
    "SamplingPeriod",
    "SARIMAProcess",
    "SARMAProcess",
    "SASTriangle",
    "SatelliteData",
    "SatisfiabilityCount",
    "SatisfiabilityInstances",
    "SatisfiableQ",
    "Saturday",
    "Save",
    "Saveable",
    "SaveAutoDelete",
    "SaveConnection",
    "SaveDefinitions",
    "SavitzkyGolayMatrix",
    "SawtoothWave",
    "Scale",
    "Scaled",
    "ScaleDivisions",
    "ScaledMousePosition",
    "ScaleOrigin",
    "ScalePadding",
    "ScaleRanges",
    "ScaleRangeStyle",
    "ScalingFunctions",
    "ScalingMatrix",
    "ScalingTransform",
    "Scan",
    "ScheduledTask",
    "ScheduledTaskActiveQ",
    "ScheduledTaskInformation",
    "ScheduledTaskInformationData",
    "ScheduledTaskObject",
    "ScheduledTasks",
    "SchurDecomposition",
    "ScientificForm",
    "ScientificNotationThreshold",
    "ScorerGi",
    "ScorerGiPrime",
    "ScorerHi",
    "ScorerHiPrime",
    "ScreenRectangle",
    "ScreenStyleEnvironment",
    "ScriptBaselineShifts",
    "ScriptForm",
    "ScriptLevel",
    "ScriptMinSize",
    "ScriptRules",
    "ScriptSizeMultipliers",
    "Scrollbars",
    "ScrollingOptions",
    "ScrollPosition",
    "SearchAdjustment",
    "SearchIndexObject",
    "SearchIndices",
    "SearchQueryString",
    "SearchResultObject",
    "Sec",
    "Sech",
    "SechDistribution",
    "SecondOrderConeOptimization",
    "SectionGrouping",
    "SectorChart",
    "SectorChart3D",
    "SectorOrigin",
    "SectorSpacing",
    "SecuredAuthenticationKey",
    "SecuredAuthenticationKeys",
    "SecurityCertificate",
    "SeedRandom",
    "Select",
    "Selectable",
    "SelectComponents",
    "SelectedCells",
    "SelectedNotebook",
    "SelectFirst",
    "Selection",
    "SelectionAnimate",
    "SelectionCell",
    "SelectionCellCreateCell",
    "SelectionCellDefaultStyle",
    "SelectionCellParentStyle",
    "SelectionCreateCell",
    "SelectionDebuggerTag",
    "SelectionEvaluate",
    "SelectionEvaluateCreateCell",
    "SelectionMove",
    "SelectionPlaceholder",
    "SelectWithContents",
    "SelfLoops",
    "SelfLoopStyle",
    "SemanticImport",
    "SemanticImportString",
    "SemanticInterpretation",
    "SemialgebraicComponentInstances",
    "SemidefiniteOptimization",
    "SendMail",
    "SendMessage",
    "Sequence",
    "SequenceAlignment",
    "SequenceAttentionLayer",
    "SequenceCases",
    "SequenceCount",
    "SequenceFold",
    "SequenceFoldList",
    "SequenceForm",
    "SequenceHold",
    "SequenceIndicesLayer",
    "SequenceLastLayer",
    "SequenceMostLayer",
    "SequencePosition",
    "SequencePredict",
    "SequencePredictorFunction",
    "SequenceReplace",
    "SequenceRestLayer",
    "SequenceReverseLayer",
    "SequenceSplit",
    "Series",
    "SeriesCoefficient",
    "SeriesData",
    "SeriesTermGoal",
    "ServiceConnect",
    "ServiceDisconnect",
    "ServiceExecute",
    "ServiceObject",
    "ServiceRequest",
    "ServiceResponse",
    "ServiceSubmit",
    "SessionSubmit",
    "SessionTime",
    "Set",
    "SetAccuracy",
    "SetAlphaChannel",
    "SetAttributes",
    "Setbacks",
    "SetCloudDirectory",
    "SetCookies",
    "SetDelayed",
    "SetDirectory",
    "SetEnvironment",
    "SetFileDate",
    "SetFileFormatProperties",
    "SetOptions",
    "SetOptionsPacket",
    "SetPermissions",
    "SetPrecision",
    "SetProperty",
    "SetSecuredAuthenticationKey",
    "SetSelectedNotebook",
    "SetSharedFunction",
    "SetSharedVariable",
    "SetStreamPosition",
    "SetSystemModel",
    "SetSystemOptions",
    "Setter",
    "SetterBar",
    "SetterBox",
    "SetterBoxOptions",
    "Setting",
    "SetUsers",
    "Shading",
    "Shallow",
    "ShannonWavelet",
    "ShapiroWilkTest",
    "Share",
    "SharingList",
    "Sharpen",
    "ShearingMatrix",
    "ShearingTransform",
    "ShellRegion",
    "ShenCastanMatrix",
    "ShiftedGompertzDistribution",
    "ShiftRegisterSequence",
    "Short",
    "ShortDownArrow",
    "Shortest",
    "ShortestMatch",
    "ShortestPathFunction",
    "ShortLeftArrow",
    "ShortRightArrow",
    "ShortTimeFourier",
    "ShortTimeFourierData",
    "ShortUpArrow",
    "Show",
    "ShowAutoConvert",
    "ShowAutoSpellCheck",
    "ShowAutoStyles",
    "ShowCellBracket",
    "ShowCellLabel",
    "ShowCellTags",
    "ShowClosedCellArea",
    "ShowCodeAssist",
    "ShowContents",
    "ShowControls",
    "ShowCursorTracker",
    "ShowGroupOpenCloseIcon",
    "ShowGroupOpener",
    "ShowInvisibleCharacters",
    "ShowPageBreaks",
    "ShowPredictiveInterface",
    "ShowSelection",
    "ShowShortBoxForm",
    "ShowSpecialCharacters",
    "ShowStringCharacters",
    "ShowSyntaxStyles",
    "ShrinkingDelay",
    "ShrinkWrapBoundingBox",
    "SiderealTime",
    "SiegelTheta",
    "SiegelTukeyTest",
    "SierpinskiCurve",
    "SierpinskiMesh",
    "Sign",
    "Signature",
    "SignedRankTest",
    "SignedRegionDistance",
    "SignificanceLevel",
    "SignPadding",
    "SignTest",
    "SimilarityRules",
    "SimpleGraph",
    "SimpleGraphQ",
    "SimplePolygonQ",
    "SimplePolyhedronQ",
    "Simplex",
    "Simplify",
    "Sin",
    "Sinc",
    "SinghMaddalaDistribution",
    "SingleEvaluation",
    "SingleLetterItalics",
    "SingleLetterStyle",
    "SingularValueDecomposition",
    "SingularValueList",
    "SingularValuePlot",
    "SingularValues",
    "Sinh",
    "SinhIntegral",
    "SinIntegral",
    "SixJSymbol",
    "Skeleton",
    "SkeletonTransform",
    "SkellamDistribution",
    "Skewness",
    "SkewNormalDistribution",
    "SkinStyle",
    "Skip",
    "SliceContourPlot3D",
    "SliceDensityPlot3D",
    "SliceDistribution",
    "SliceVectorPlot3D",
    "Slider",
    "Slider2D",
    "Slider2DBox",
    "Slider2DBoxOptions",
    "SliderBox",
    "SliderBoxOptions",
    "SlideShowVideo",
    "SlideView",
    "Slot",
    "SlotSequence",
    "Small",
    "SmallCircle",
    "Smaller",
    "SmithDecomposition",
    "SmithDelayCompensator",
    "SmithWatermanSimilarity",
    "SmoothDensityHistogram",
    "SmoothHistogram",
    "SmoothHistogram3D",
    "SmoothKernelDistribution",
    "SmoothPointDensity",
    "SnDispersion",
    "Snippet",
    "SnippetsVideo",
    "SnubPolyhedron",
    "SocialMediaData",
    "Socket",
    "SocketConnect",
    "SocketListen",
    "SocketListener",
    "SocketObject",
    "SocketOpen",
    "SocketReadMessage",
    "SocketReadyQ",
    "Sockets",
    "SocketWaitAll",
    "SocketWaitNext",
    "SoftmaxLayer",
    "SokalSneathDissimilarity",
    "SolarEclipse",
    "SolarSystemFeatureData",
    "SolarTime",
    "SolidAngle",
    "SolidBoundaryLoadValue",
    "SolidData",
    "SolidDisplacementCondition",
    "SolidFixedCondition",
    "SolidMechanicsPDEComponent",
    "SolidMechanicsStrain",
    "SolidMechanicsStress",
    "SolidRegionQ",
    "Solve",
    "SolveAlways",
    "SolveDelayed",
    "SolveValues",
    "Sort",
    "SortBy",
    "SortedBy",
    "SortedEntityClass",
    "Sound",
    "SoundAndGraphics",
    "SoundNote",
    "SoundVolume",
    "SourceLink",
    "SourcePDETerm",
    "Sow",
    "Space",
    "SpaceCurveData",
    "SpaceForm",
    "Spacer",
    "Spacings",
    "Span",
    "SpanAdjustments",
    "SpanCharacterRounding",
    "SpanFromAbove",
    "SpanFromBoth",
    "SpanFromLeft",
    "SpanLineThickness",
    "SpanMaxSize",
    "SpanMinSize",
    "SpanningCharacters",
    "SpanSymmetric",
    "SparseArray",
    "SparseArrayQ",
    "SpatialBinnedPointData",
    "SpatialBoundaryCorrection",
    "SpatialEstimate",
    "SpatialEstimatorFunction",
    "SpatialGraphDistribution",
    "SpatialJ",
    "SpatialMedian",
    "SpatialNoiseLevel",
    "SpatialObservationRegionQ",
    "SpatialPointData",
    "SpatialPointSelect",
    "SpatialRandomnessTest",
    "SpatialTransformationLayer",
    "SpatialTrendFunction",
    "Speak",
    "SpeakerMatchQ",
    "SpearmanRankTest",
    "SpearmanRho",
    "SpeciesData",
    "SpecificityGoal",
    "SpectralLineData",
    "Spectrogram",
    "SpectrogramArray",
    "Specularity",
    "SpeechCases",
    "SpeechInterpreter",
    "SpeechRecognize",
    "SpeechSynthesize",
    "SpellingCorrection",
    "SpellingCorrectionList",
    "SpellingDictionaries",
    "SpellingDictionariesPath",
    "SpellingOptions",
    "Sphere",
    "SphereBox",
    "SphereBoxOptions",
    "SpherePoints",
    "SphericalBesselJ",
    "SphericalBesselY",
    "SphericalHankelH1",
    "SphericalHankelH2",
    "SphericalHarmonicY",
    "SphericalPlot3D",
    "SphericalRegion",
    "SphericalShell",
    "SpheroidalEigenvalue",
    "SpheroidalJoiningFactor",
    "SpheroidalPS",
    "SpheroidalPSPrime",
    "SpheroidalQS",
    "SpheroidalQSPrime",
    "SpheroidalRadialFactor",
    "SpheroidalS1",
    "SpheroidalS1Prime",
    "SpheroidalS2",
    "SpheroidalS2Prime",
    "Splice",
    "SplicedDistribution",
    "SplineClosed",
    "SplineDegree",
    "SplineKnots",
    "SplineWeights",
    "Split",
    "SplitBy",
    "SpokenString",
    "SpotLight",
    "Sqrt",
    "SqrtBox",
    "SqrtBoxOptions",
    "Square",
    "SquaredEuclideanDistance",
    "SquareFreeQ",
    "SquareIntersection",
    "SquareMatrixQ",
    "SquareRepeatingElement",
    "SquaresR",
    "SquareSubset",
    "SquareSubsetEqual",
    "SquareSuperset",
    "SquareSupersetEqual",
    "SquareUnion",
    "SquareWave",
    "SSSTriangle",
    "StabilityMargins",
    "StabilityMarginsStyle",
    "StableDistribution",
    "Stack",
    "StackBegin",
    "StackComplete",
    "StackedDateListPlot",
    "StackedListPlot",
    "StackInhibit",
    "StadiumShape",
    "StandardAtmosphereData",
    "StandardDeviation",
    "StandardDeviationFilter",
    "StandardForm",
    "Standardize",
    "Standardized",
    "StandardOceanData",
    "StandbyDistribution",
    "Star",
    "StarClusterData",
    "StarData",
    "StarGraph",
    "StartAsynchronousTask",
    "StartExternalSession",
    "StartingStepSize",
    "StartOfLine",
    "StartOfString",
    "StartProcess",
    "StartScheduledTask",
    "StartupSound",
    "StartWebSession",
    "StateDimensions",
    "StateFeedbackGains",
    "StateOutputEstimator",
    "StateResponse",
    "StateSpaceModel",
    "StateSpaceRealization",
    "StateSpaceTransform",
    "StateTransformationLinearize",
    "StationaryDistribution",
    "StationaryWaveletPacketTransform",
    "StationaryWaveletTransform",
    "StatusArea",
    "StatusCentrality",
    "StepMonitor",
    "StereochemistryElements",
    "StieltjesGamma",
    "StippleShading",
    "StirlingS1",
    "StirlingS2",
    "StopAsynchronousTask",
    "StoppingPowerData",
    "StopScheduledTask",
    "StrataVariables",
    "StratonovichProcess",
    "StraussHardcorePointProcess",
    "StraussPointProcess",
    "StreamColorFunction",
    "StreamColorFunctionScaling",
    "StreamDensityPlot",
    "StreamMarkers",
    "StreamPlot",
    "StreamPlot3D",
    "StreamPoints",
    "StreamPosition",
    "Streams",
    "StreamScale",
    "StreamStyle",
    "StrictInequalities",
    "String",
    "StringBreak",
    "StringByteCount",
    "StringCases",
    "StringContainsQ",
    "StringCount",
    "StringDelete",
    "StringDrop",
    "StringEndsQ",
    "StringExpression",
    "StringExtract",
    "StringForm",
    "StringFormat",
    "StringFormatQ",
    "StringFreeQ",
    "StringInsert",
    "StringJoin",
    "StringLength",
    "StringMatchQ",
    "StringPadLeft",
    "StringPadRight",
    "StringPart",
    "StringPartition",
    "StringPosition",
    "StringQ",
    "StringRepeat",
    "StringReplace",
    "StringReplaceList",
    "StringReplacePart",
    "StringReverse",
    "StringRiffle",
    "StringRotateLeft",
    "StringRotateRight",
    "StringSkeleton",
    "StringSplit",
    "StringStartsQ",
    "StringTake",
    "StringTakeDrop",
    "StringTemplate",
    "StringToByteArray",
    "StringToStream",
    "StringTrim",
    "StripBoxes",
    "StripOnInput",
    "StripStyleOnPaste",
    "StripWrapperBoxes",
    "StrokeForm",
    "Struckthrough",
    "StructuralImportance",
    "StructuredArray",
    "StructuredArrayHeadQ",
    "StructuredSelection",
    "StruveH",
    "StruveL",
    "Stub",
    "StudentTDistribution",
    "Style",
    "StyleBox",
    "StyleBoxAutoDelete",
    "StyleData",
    "StyleDefinitions",
    "StyleForm",
    "StyleHints",
    "StyleKeyMapping",
    "StyleMenuListing",
    "StyleNameDialogSettings",
    "StyleNames",
    "StylePrint",
    "StyleSheetPath",
    "Subdivide",
    "Subfactorial",
    "Subgraph",
    "SubMinus",
    "SubPlus",
    "SubresultantPolynomialRemainders",
    "SubresultantPolynomials",
    "Subresultants",
    "Subscript",
    "SubscriptBox",
    "SubscriptBoxOptions",
    "Subscripted",
    "Subsequences",
    "Subset",
    "SubsetCases",
    "SubsetCount",
    "SubsetEqual",
    "SubsetMap",
    "SubsetPosition",
    "SubsetQ",
    "SubsetReplace",
    "Subsets",
    "SubStar",
    "SubstitutionSystem",
    "Subsuperscript",
    "SubsuperscriptBox",
    "SubsuperscriptBoxOptions",
    "SubtitleEncoding",
    "SubtitleTrackSelection",
    "Subtract",
    "SubtractFrom",
    "SubtractSides",
    "SubValues",
    "Succeeds",
    "SucceedsEqual",
    "SucceedsSlantEqual",
    "SucceedsTilde",
    "Success",
    "SuchThat",
    "Sum",
    "SumConvergence",
    "SummationLayer",
    "Sunday",
    "SunPosition",
    "Sunrise",
    "Sunset",
    "SuperDagger",
    "SuperMinus",
    "SupernovaData",
    "SuperPlus",
    "Superscript",
    "SuperscriptBox",
    "SuperscriptBoxOptions",
    "Superset",
    "SupersetEqual",
    "SuperStar",
    "Surd",
    "SurdForm",
    "SurfaceAppearance",
    "SurfaceArea",
    "SurfaceColor",
    "SurfaceData",
    "SurfaceGraphics",
    "SurvivalDistribution",
    "SurvivalFunction",
    "SurvivalModel",
    "SurvivalModelFit",
    "SuspendPacket",
    "SuzukiDistribution",
    "SuzukiGroupSuz",
    "SwatchLegend",
    "Switch",
    "Symbol",
    "SymbolName",
    "SymletWavelet",
    "Symmetric",
    "SymmetricDifference",
    "SymmetricGroup",
    "SymmetricKey",
    "SymmetricMatrixQ",
    "SymmetricPolynomial",
    "SymmetricReduction",
    "Symmetrize",
    "SymmetrizedArray",
    "SymmetrizedArrayRules",
    "SymmetrizedDependentComponents",
    "SymmetrizedIndependentComponents",
    "SymmetrizedReplacePart",
    "SynchronousInitialization",
    "SynchronousUpdating",
    "Synonyms",
    "Syntax",
    "SyntaxForm",
    "SyntaxInformation",
    "SyntaxLength",
    "SyntaxPacket",
    "SyntaxQ",
    "SynthesizeMissingValues",
    "SystemCredential",
    "SystemCredentialData",
    "SystemCredentialKey",
    "SystemCredentialKeys",
    "SystemCredentialStoreObject",
    "SystemDialogInput",
    "SystemException",
    "SystemGet",
    "SystemHelpPath",
    "SystemInformation",
    "SystemInformationData",
    "SystemInstall",
    "SystemModel",
    "SystemModeler",
    "SystemModelExamples",
    "SystemModelLinearize",
    "SystemModelMeasurements",
    "SystemModelParametricSimulate",
    "SystemModelPlot",
    "SystemModelProgressReporting",
    "SystemModelReliability",
    "SystemModels",
    "SystemModelSimulate",
    "SystemModelSimulateSensitivity",
    "SystemModelSimulationData",
    "SystemOpen",
    "SystemOptions",
    "SystemProcessData",
    "SystemProcesses",
    "SystemsConnectionsModel",
    "SystemsModelControllerData",
    "SystemsModelDelay",
    "SystemsModelDelayApproximate",
    "SystemsModelDelete",
    "SystemsModelDimensions",
    "SystemsModelExtract",
    "SystemsModelFeedbackConnect",
    "SystemsModelLabels",
    "SystemsModelLinearity",
    "SystemsModelMerge",
    "SystemsModelOrder",
    "SystemsModelParallelConnect",
    "SystemsModelSeriesConnect",
    "SystemsModelStateFeedbackConnect",
    "SystemsModelVectorRelativeOrders",
    "SystemStub",
    "SystemTest",
    "Tab",
    "TabFilling",
    "Table",
    "TableAlignments",
    "TableDepth",
    "TableDirections",
    "TableForm",
    "TableHeadings",
    "TableSpacing",
    "TableView",
    "TableViewBox",
    "TableViewBoxAlignment",
    "TableViewBoxBackground",
    "TableViewBoxHeaders",
    "TableViewBoxItemSize",
    "TableViewBoxItemStyle",
    "TableViewBoxOptions",
    "TabSpacings",
    "TabView",
    "TabViewBox",
    "TabViewBoxOptions",
    "TagBox",
    "TagBoxNote",
    "TagBoxOptions",
    "TaggingRules",
    "TagSet",
    "TagSetDelayed",
    "TagStyle",
    "TagUnset",
    "Take",
    "TakeDrop",
    "TakeLargest",
    "TakeLargestBy",
    "TakeList",
    "TakeSmallest",
    "TakeSmallestBy",
    "TakeWhile",
    "Tally",
    "Tan",
    "Tanh",
    "TargetDevice",
    "TargetFunctions",
    "TargetSystem",
    "TargetUnits",
    "TaskAbort",
    "TaskExecute",
    "TaskObject",
    "TaskRemove",
    "TaskResume",
    "Tasks",
    "TaskSuspend",
    "TaskWait",
    "TautologyQ",
    "TelegraphProcess",
    "TemplateApply",
    "TemplateArgBox",
    "TemplateBox",
    "TemplateBoxOptions",
    "TemplateEvaluate",
    "TemplateExpression",
    "TemplateIf",
    "TemplateObject",
    "TemplateSequence",
    "TemplateSlot",
    "TemplateSlotSequence",
    "TemplateUnevaluated",
    "TemplateVerbatim",
    "TemplateWith",
    "TemporalData",
    "TemporalRegularity",
    "Temporary",
    "TemporaryVariable",
    "TensorContract",
    "TensorDimensions",
    "TensorExpand",
    "TensorProduct",
    "TensorQ",
    "TensorRank",
    "TensorReduce",
    "TensorSymmetry",
    "TensorTranspose",
    "TensorWedge",
    "TerminatedEvaluation",
    "TernaryListPlot",
    "TernaryPlotCorners",
    "TestID",
    "TestReport",
    "TestReportObject",
    "TestResultObject",
    "Tetrahedron",
    "TetrahedronBox",
    "TetrahedronBoxOptions",
    "TeXForm",
    "TeXSave",
    "Text",
    "Text3DBox",
    "Text3DBoxOptions",
    "TextAlignment",
    "TextBand",
    "TextBoundingBox",
    "TextBox",
    "TextCases",
    "TextCell",
    "TextClipboardType",
    "TextContents",
    "TextData",
    "TextElement",
    "TextForm",
    "TextGrid",
    "TextJustification",
    "TextLine",
    "TextPacket",
    "TextParagraph",
    "TextPosition",
    "TextRecognize",
    "TextSearch",
    "TextSearchReport",
    "TextSentences",
    "TextString",
    "TextStructure",
    "TextStyle",
    "TextTranslation",
    "Texture",
    "TextureCoordinateFunction",
    "TextureCoordinateScaling",
    "TextWords",
    "Therefore",
    "ThermodynamicData",
    "ThermometerGauge",
    "Thick",
    "Thickness",
    "Thin",
    "Thinning",
    "ThisLink",
    "ThomasPointProcess",
    "ThompsonGroupTh",
    "Thread",
    "Threaded",
    "ThreadingLayer",
    "ThreeJSymbol",
    "Threshold",
    "Through",
    "Throw",
    "ThueMorse",
    "Thumbnail",
    "Thursday",
    "TickDirection",
    "TickLabelOrientation",
    "TickLabelPositioning",
    "TickLabels",
    "TickLengths",
    "TickPositions",
    "Ticks",
    "TicksStyle",
    "TideData",
    "Tilde",
    "TildeEqual",
    "TildeFullEqual",
    "TildeTilde",
    "TimeConstrained",
    "TimeConstraint",
    "TimeDirection",
    "TimeFormat",
    "TimeGoal",
    "TimelinePlot",
    "TimeObject",
    "TimeObjectQ",
    "TimeRemaining",
    "Times",
    "TimesBy",
    "TimeSeries",
    "TimeSeriesAggregate",
    "TimeSeriesForecast",
    "TimeSeriesInsert",
    "TimeSeriesInvertibility",
    "TimeSeriesMap",
    "TimeSeriesMapThread",
    "TimeSeriesModel",
    "TimeSeriesModelFit",
    "TimeSeriesResample",
    "TimeSeriesRescale",
    "TimeSeriesShift",
    "TimeSeriesThread",
    "TimeSeriesWindow",
    "TimeSystem",
    "TimeSystemConvert",
    "TimeUsed",
    "TimeValue",
    "TimeWarpingCorrespondence",
    "TimeWarpingDistance",
    "TimeZone",
    "TimeZoneConvert",
    "TimeZoneOffset",
    "Timing",
    "Tiny",
    "TitleGrouping",
    "TitsGroupT",
    "ToBoxes",
    "ToCharacterCode",
    "ToColor",
    "ToContinuousTimeModel",
    "ToDate",
    "Today",
    "ToDiscreteTimeModel",
    "ToEntity",
    "ToeplitzMatrix",
    "ToExpression",
    "ToFileName",
    "Together",
    "Toggle",
    "ToggleFalse",
    "Toggler",
    "TogglerBar",
    "TogglerBox",
    "TogglerBoxOptions",
    "ToHeldExpression",
    "ToInvertibleTimeSeries",
    "TokenWords",
    "Tolerance",
    "ToLowerCase",
    "Tomorrow",
    "ToNumberField",
    "TooBig",
    "Tooltip",
    "TooltipBox",
    "TooltipBoxOptions",
    "TooltipDelay",
    "TooltipStyle",
    "ToonShading",
    "Top",
    "TopHatTransform",
    "ToPolarCoordinates",
    "TopologicalSort",
    "ToRadicals",
    "ToRawPointer",
    "ToRules",
    "Torus",
    "TorusGraph",
    "ToSphericalCoordinates",
    "ToString",
    "Total",
    "TotalHeight",
    "TotalLayer",
    "TotalVariationFilter",
    "TotalWidth",
    "TouchPosition",
    "TouchscreenAutoZoom",
    "TouchscreenControlPlacement",
    "ToUpperCase",
    "TourVideo",
    "Tr",
    "Trace",
    "TraceAbove",
    "TraceAction",
    "TraceBackward",
    "TraceDepth",
    "TraceDialog",
    "TraceForward",
    "TraceInternal",
    "TraceLevel",
    "TraceOff",
    "TraceOn",
    "TraceOriginal",
    "TracePrint",
    "TraceScan",
    "TrackCellChangeTimes",
    "TrackedSymbols",
    "TrackingFunction",
    "TracyWidomDistribution",
    "TradingChart",
    "TraditionalForm",
    "TraditionalFunctionNotation",
    "TraditionalNotation",
    "TraditionalOrder",
    "TrainImageContentDetector",
    "TrainingProgressCheckpointing",
    "TrainingProgressFunction",
    "TrainingProgressMeasurements",
    "TrainingProgressReporting",
    "TrainingStoppingCriterion",
    "TrainingUpdateSchedule",
    "TrainTextContentDetector",
    "TransferFunctionCancel",
    "TransferFunctionExpand",
    "TransferFunctionFactor",
    "TransferFunctionModel",
    "TransferFunctionPoles",
    "TransferFunctionTransform",
    "TransferFunctionZeros",
    "TransformationClass",
    "TransformationFunction",
    "TransformationFunctions",
    "TransformationMatrix",
    "TransformedDistribution",
    "TransformedField",
    "TransformedProcess",
    "TransformedRegion",
    "TransitionDirection",
    "TransitionDuration",
    "TransitionEffect",
    "TransitiveClosureGraph",
    "TransitiveReductionGraph",
    "Translate",
    "TranslationOptions",
    "TranslationTransform",
    "Transliterate",
    "Transparent",
    "TransparentColor",
    "Transpose",
    "TransposeLayer",
    "TrapEnterKey",
    "TrapSelection",
    "TravelDirections",
    "TravelDirectionsData",
    "TravelDistance",
    "TravelDistanceList",
    "TravelMethod",
    "TravelTime",
    "Tree",
    "TreeCases",
    "TreeChildren",
    "TreeCount",
    "TreeData",
    "TreeDelete",
    "TreeDepth",
    "TreeElementCoordinates",
    "TreeElementLabel",
    "TreeElementLabelFunction",
    "TreeElementLabelStyle",
    "TreeElementShape",
    "TreeElementShapeFunction",
    "TreeElementSize",
    "TreeElementSizeFunction",
    "TreeElementStyle",
    "TreeElementStyleFunction",
    "TreeExpression",
    "TreeExtract",
    "TreeFold",
    "TreeForm",
    "TreeGraph",
    "TreeGraphQ",
    "TreeInsert",
    "TreeLayout",
    "TreeLeafCount",
    "TreeLeafQ",
    "TreeLeaves",
    "TreeLevel",
    "TreeMap",
    "TreeMapAt",
    "TreeOutline",
    "TreePlot",
    "TreePosition",
    "TreeQ",
    "TreeReplacePart",
    "TreeRules",
    "TreeScan",
    "TreeSelect",
    "TreeSize",
    "TreeTraversalOrder",
    "TrendStyle",
    "Triangle",
    "TriangleCenter",
    "TriangleConstruct",
    "TriangleMeasurement",
    "TriangleWave",
    "TriangularDistribution",
    "TriangulateMesh",
    "Trig",
    "TrigExpand",
    "TrigFactor",
    "TrigFactorList",
    "Trigger",
    "TrigReduce",
    "TrigToExp",
    "TrimmedMean",
    "TrimmedVariance",
    "TropicalStormData",
    "True",
    "TrueQ",
    "TruncatedDistribution",
    "TruncatedPolyhedron",
    "TsallisQExponentialDistribution",
    "TsallisQGaussianDistribution",
    "TTest",
    "Tube",
    "TubeBezierCurveBox",
    "TubeBezierCurveBoxOptions",
    "TubeBox",
    "TubeBoxOptions",
    "TubeBSplineCurveBox",
    "TubeBSplineCurveBoxOptions",
    "Tuesday",
    "TukeyLambdaDistribution",
    "TukeyWindow",
    "TunnelData",
    "Tuples",
    "TuranGraph",
    "TuringMachine",
    "TuttePolynomial",
    "TwoWayRule",
    "Typed",
    "TypeDeclaration",
    "TypeEvaluate",
    "TypeHint",
    "TypeOf",
    "TypeSpecifier",
    "UnateQ",
    "Uncompress",
    "UnconstrainedParameters",
    "Undefined",
    "UnderBar",
    "Underflow",
    "Underlined",
    "Underoverscript",
    "UnderoverscriptBox",
    "UnderoverscriptBoxOptions",
    "Underscript",
    "UnderscriptBox",
    "UnderscriptBoxOptions",
    "UnderseaFeatureData",
    "UndirectedEdge",
    "UndirectedGraph",
    "UndirectedGraphQ",
    "UndoOptions",
    "UndoTrackedVariables",
    "Unequal",
    "UnequalTo",
    "Unevaluated",
    "UniformDistribution",
    "UniformGraphDistribution",
    "UniformPolyhedron",
    "UniformSumDistribution",
    "Uninstall",
    "Union",
    "UnionedEntityClass",
    "UnionPlus",
    "Unique",
    "UniqueElements",
    "UnitaryMatrixQ",
    "UnitBox",
    "UnitConvert",
    "UnitDimensions",
    "Unitize",
    "UnitRootTest",
    "UnitSimplify",
    "UnitStep",
    "UnitSystem",
    "UnitTriangle",
    "UnitVector",
    "UnitVectorLayer",
    "UnityDimensions",
    "UniverseModelData",
    "UniversityData",
    "UnixTime",
    "UnlabeledTree",
    "UnmanageObject",
    "Unprotect",
    "UnregisterExternalEvaluator",
    "UnsameQ",
    "UnsavedVariables",
    "Unset",
    "UnsetShared",
    "Until",
    "UntrackedVariables",
    "Up",
    "UpArrow",
    "UpArrowBar",
    "UpArrowDownArrow",
    "Update",
    "UpdateDynamicObjects",
    "UpdateDynamicObjectsSynchronous",
    "UpdateInterval",
    "UpdatePacletSites",
    "UpdateSearchIndex",
    "UpDownArrow",
    "UpEquilibrium",
    "UpperCaseQ",
    "UpperLeftArrow",
    "UpperRightArrow",
    "UpperTriangularize",
    "UpperTriangularMatrix",
    "UpperTriangularMatrixQ",
    "Upsample",
    "UpSet",
    "UpSetDelayed",
    "UpTee",
    "UpTeeArrow",
    "UpTo",
    "UpValues",
    "URL",
    "URLBuild",
    "URLDecode",
    "URLDispatcher",
    "URLDownload",
    "URLDownloadSubmit",
    "URLEncode",
    "URLExecute",
    "URLExpand",
    "URLFetch",
    "URLFetchAsynchronous",
    "URLParse",
    "URLQueryDecode",
    "URLQueryEncode",
    "URLRead",
    "URLResponseTime",
    "URLSave",
    "URLSaveAsynchronous",
    "URLShorten",
    "URLSubmit",
    "UseEmbeddedLibrary",
    "UseGraphicsRange",
    "UserDefinedWavelet",
    "Using",
    "UsingFrontEnd",
    "UtilityFunction",
    "V2Get",
    "ValenceErrorHandling",
    "ValenceFilling",
    "ValidationLength",
    "ValidationSet",
    "ValueBox",
    "ValueBoxOptions",
    "ValueDimensions",
    "ValueForm",
    "ValuePreprocessingFunction",
    "ValueQ",
    "Values",
    "ValuesData",
    "VandermondeMatrix",
    "Variables",
    "Variance",
    "VarianceEquivalenceTest",
    "VarianceEstimatorFunction",
    "VarianceGammaDistribution",
    "VarianceGammaPointProcess",
    "VarianceTest",
    "VariogramFunction",
    "VariogramModel",
    "VectorAngle",
    "VectorAround",
    "VectorAspectRatio",
    "VectorColorFunction",
    "VectorColorFunctionScaling",
    "VectorDensityPlot",
    "VectorDisplacementPlot",
    "VectorDisplacementPlot3D",
    "VectorGlyphData",
    "VectorGreater",
    "VectorGreaterEqual",
    "VectorLess",
    "VectorLessEqual",
    "VectorMarkers",
    "VectorPlot",
    "VectorPlot3D",
    "VectorPoints",
    "VectorQ",
    "VectorRange",
    "Vectors",
    "VectorScale",
    "VectorScaling",
    "VectorSizes",
    "VectorStyle",
    "Vee",
    "Verbatim",
    "Verbose",
    "VerificationTest",
    "VerifyConvergence",
    "VerifyDerivedKey",
    "VerifyDigitalSignature",
    "VerifyFileSignature",
    "VerifyInterpretation",
    "VerifySecurityCertificates",
    "VerifySolutions",
    "VerifyTestAssumptions",
    "VersionedPreferences",
    "VertexAdd",
    "VertexCapacity",
    "VertexChromaticNumber",
    "VertexColors",
    "VertexComponent",
    "VertexConnectivity",
    "VertexContract",
    "VertexCoordinateRules",
    "VertexCoordinates",
    "VertexCorrelationSimilarity",
    "VertexCosineSimilarity",
    "VertexCount",
    "VertexCoverQ",
    "VertexDataCoordinates",
    "VertexDegree",
    "VertexDelete",
    "VertexDiceSimilarity",
    "VertexEccentricity",
    "VertexInComponent",
    "VertexInComponentGraph",
    "VertexInDegree",
    "VertexIndex",
    "VertexJaccardSimilarity",
    "VertexLabeling",
    "VertexLabels",
    "VertexLabelStyle",
    "VertexList",
    "VertexNormals",
    "VertexOutComponent",
    "VertexOutComponentGraph",
    "VertexOutDegree",
    "VertexQ",
    "VertexRenderingFunction",
    "VertexReplace",
    "VertexShape",
    "VertexShapeFunction",
    "VertexSize",
    "VertexStyle",
    "VertexTextureCoordinates",
    "VertexTransitiveGraphQ",
    "VertexWeight",
    "VertexWeightedGraphQ",
    "Vertical",
    "VerticalBar",
    "VerticalForm",
    "VerticalGauge",
    "VerticalSeparator",
    "VerticalSlider",
    "VerticalTilde",
    "Video",
    "VideoCapture",
    "VideoCombine",
    "VideoDelete",
    "VideoEncoding",
    "VideoExtractFrames",
    "VideoFrameList",
    "VideoFrameMap",
    "VideoGenerator",
    "VideoInsert",
    "VideoIntervals",
    "VideoJoin",
    "VideoMap",
    "VideoMapList",
    "VideoMapTimeSeries",
    "VideoPadding",
    "VideoPause",
    "VideoPlay",
    "VideoQ",
    "VideoRecord",
    "VideoReplace",
    "VideoScreenCapture",
    "VideoSplit",
    "VideoStop",
    "VideoStream",
    "VideoStreams",
    "VideoTimeStretch",
    "VideoTrackSelection",
    "VideoTranscode",
    "VideoTransparency",
    "VideoTrim",
    "ViewAngle",
    "ViewCenter",
    "ViewMatrix",
    "ViewPoint",
    "ViewPointSelectorSettings",
    "ViewPort",
    "ViewProjection",
    "ViewRange",
    "ViewVector",
    "ViewVertical",
    "VirtualGroupData",
    "Visible",
    "VisibleCell",
    "VoiceStyleData",
    "VoigtDistribution",
    "VolcanoData",
    "Volume",
    "VonMisesDistribution",
    "VoronoiMesh",
    "WaitAll",
    "WaitAsynchronousTask",
    "WaitNext",
    "WaitUntil",
    "WakebyDistribution",
    "WalleniusHypergeometricDistribution",
    "WaringYuleDistribution",
    "WarpingCorrespondence",
    "WarpingDistance",
    "WatershedComponents",
    "WatsonUSquareTest",
    "WattsStrogatzGraphDistribution",
    "WaveletBestBasis",
    "WaveletFilterCoefficients",
    "WaveletImagePlot",
    "WaveletListPlot",
    "WaveletMapIndexed",
    "WaveletMatrixPlot",
    "WaveletPhi",
    "WaveletPsi",
    "WaveletScale",
    "WaveletScalogram",
    "WaveletThreshold",
    "WavePDEComponent",
    "WeaklyConnectedComponents",
    "WeaklyConnectedGraphComponents",
    "WeaklyConnectedGraphQ",
    "WeakStationarity",
    "WeatherData",
    "WeatherForecastData",
    "WebAudioSearch",
    "WebColumn",
    "WebElementObject",
    "WeberE",
    "WebExecute",
    "WebImage",
    "WebImageSearch",
    "WebItem",
    "WebPageMetaInformation",
    "WebRow",
    "WebSearch",
    "WebSessionObject",
    "WebSessions",
    "WebWindowObject",
    "Wedge",
    "Wednesday",
    "WeibullDistribution",
    "WeierstrassE1",
    "WeierstrassE2",
    "WeierstrassE3",
    "WeierstrassEta1",
    "WeierstrassEta2",
    "WeierstrassEta3",
    "WeierstrassHalfPeriods",
    "WeierstrassHalfPeriodW1",
    "WeierstrassHalfPeriodW2",
    "WeierstrassHalfPeriodW3",
    "WeierstrassInvariantG2",
    "WeierstrassInvariantG3",
    "WeierstrassInvariants",
    "WeierstrassP",
    "WeierstrassPPrime",
    "WeierstrassSigma",
    "WeierstrassZeta",
    "WeightedAdjacencyGraph",
    "WeightedAdjacencyMatrix",
    "WeightedData",
    "WeightedGraphQ",
    "Weights",
    "WelchWindow",
    "WheelGraph",
    "WhenEvent",
    "Which",
    "While",
    "White",
    "WhiteNoiseProcess",
    "WhitePoint",
    "Whitespace",
    "WhitespaceCharacter",
    "WhittakerM",
    "WhittakerW",
    "WholeCellGroupOpener",
    "WienerFilter",
    "WienerProcess",
    "WignerD",
    "WignerSemicircleDistribution",
    "WikidataData",
    "WikidataSearch",
    "WikipediaData",
    "WikipediaSearch",
    "WilksW",
    "WilksWTest",
    "WindDirectionData",
    "WindingCount",
    "WindingPolygon",
    "WindowClickSelect",
    "WindowElements",
    "WindowFloating",
    "WindowFrame",
    "WindowFrameElements",
    "WindowMargins",
    "WindowMovable",
    "WindowOpacity",
    "WindowPersistentStyles",
    "WindowSelected",
    "WindowSize",
    "WindowStatusArea",
    "WindowTitle",
    "WindowToolbars",
    "WindowWidth",
    "WindSpeedData",
    "WindVectorData",
    "WinsorizedMean",
    "WinsorizedVariance",
    "WishartMatrixDistribution",
    "With",
    "WithCleanup",
    "WithLock",
    "WolframAlpha",
    "WolframAlphaDate",
    "WolframAlphaQuantity",
    "WolframAlphaResult",
    "WolframCloudSettings",
    "WolframLanguageData",
    "Word",
    "WordBoundary",
    "WordCharacter",
    "WordCloud",
    "WordCount",
    "WordCounts",
    "WordData",
    "WordDefinition",
    "WordFrequency",
    "WordFrequencyData",
    "WordList",
    "WordOrientation",
    "WordSearch",
    "WordSelectionFunction",
    "WordSeparators",
    "WordSpacings",
    "WordStem",
    "WordTranslation",
    "WorkingPrecision",
    "WrapAround",
    "Write",
    "WriteLine",
    "WriteString",
    "Wronskian",
    "XMLElement",
    "XMLObject",
    "XMLTemplate",
    "Xnor",
    "Xor",
    "XYZColor",
    "Yellow",
    "Yesterday",
    "YuleDissimilarity",
    "ZernikeR",
    "ZeroSymmetric",
    "ZeroTest",
    "ZeroWidthTimes",
    "Zeta",
    "ZetaZero",
    "ZIPCodeData",
    "ZipfDistribution",
    "ZoomCenter",
    "ZoomFactor",
    "ZTest",
    "ZTransform",
    "$Aborted",
    "$ActivationGroupID",
    "$ActivationKey",
    "$ActivationUserRegistered",
    "$AddOnsDirectory",
    "$AllowDataUpdates",
    "$AllowExternalChannelFunctions",
    "$AllowInternet",
    "$AssertFunction",
    "$Assumptions",
    "$AsynchronousTask",
    "$AudioDecoders",
    "$AudioEncoders",
    "$AudioInputDevices",
    "$AudioOutputDevices",
    "$BaseDirectory",
    "$BasePacletsDirectory",
    "$BatchInput",
    "$BatchOutput",
    "$BlockchainBase",
    "$BoxForms",
    "$ByteOrdering",
    "$CacheBaseDirectory",
    "$Canceled",
    "$ChannelBase",
    "$CharacterEncoding",
    "$CharacterEncodings",
    "$CloudAccountName",
    "$CloudBase",
    "$CloudConnected",
    "$CloudConnection",
    "$CloudCreditsAvailable",
    "$CloudEvaluation",
    "$CloudExpressionBase",
    "$CloudObjectNameFormat",
    "$CloudObjectURLType",
    "$CloudRootDirectory",
    "$CloudSymbolBase",
    "$CloudUserID",
    "$CloudUserUUID",
    "$CloudVersion",
    "$CloudVersionNumber",
    "$CloudWolframEngineVersionNumber",
    "$CommandLine",
    "$CompilationTarget",
    "$CompilerEnvironment",
    "$ConditionHold",
    "$ConfiguredKernels",
    "$Context",
    "$ContextAliases",
    "$ContextPath",
    "$ControlActiveSetting",
    "$Cookies",
    "$CookieStore",
    "$CreationDate",
    "$CryptographicEllipticCurveNames",
    "$CurrentLink",
    "$CurrentTask",
    "$CurrentWebSession",
    "$DataStructures",
    "$DateStringFormat",
    "$DefaultAudioInputDevice",
    "$DefaultAudioOutputDevice",
    "$DefaultFont",
    "$DefaultFrontEnd",
    "$DefaultImagingDevice",
    "$DefaultKernels",
    "$DefaultLocalBase",
    "$DefaultLocalKernel",
    "$DefaultMailbox",
    "$DefaultNetworkInterface",
    "$DefaultPath",
    "$DefaultProxyRules",
    "$DefaultRemoteBatchSubmissionEnvironment",
    "$DefaultRemoteKernel",
    "$DefaultSystemCredentialStore",
    "$Display",
    "$DisplayFunction",
    "$DistributedContexts",
    "$DynamicEvaluation",
    "$Echo",
    "$EmbedCodeEnvironments",
    "$EmbeddableServices",
    "$EntityStores",
    "$Epilog",
    "$EvaluationCloudBase",
    "$EvaluationCloudObject",
    "$EvaluationEnvironment",
    "$ExportFormats",
    "$ExternalIdentifierTypes",
    "$ExternalStorageBase",
    "$Failed",
    "$FinancialDataSource",
    "$FontFamilies",
    "$FormatType",
    "$FrontEnd",
    "$FrontEndSession",
    "$GeneratedAssetLocation",
    "$GeoEntityTypes",
    "$GeoLocation",
    "$GeoLocationCity",
    "$GeoLocationCountry",
    "$GeoLocationPrecision",
    "$GeoLocationSource",
    "$HistoryLength",
    "$HomeDirectory",
    "$HTMLExportRules",
    "$HTTPCookies",
    "$HTTPRequest",
    "$IgnoreEOF",
    "$ImageFormattingWidth",
    "$ImageResolution",
    "$ImagingDevice",
    "$ImagingDevices",
    "$ImportFormats",
    "$IncomingMailSettings",
    "$InitialDirectory",
    "$Initialization",
    "$InitializationContexts",
    "$Input",
    "$InputFileName",
    "$InputStreamMethods",
    "$Inspector",
    "$InstallationDate",
    "$InstallationDirectory",
    "$InterfaceEnvironment",
    "$InterpreterTypes",
    "$IterationLimit",
    "$KernelCount",
    "$KernelID",
    "$Language",
    "$LaunchDirectory",
    "$LibraryPath",
    "$LicenseExpirationDate",
    "$LicenseID",
    "$LicenseProcesses",
    "$LicenseServer",
    "$LicenseSubprocesses",
    "$LicenseType",
    "$Line",
    "$Linked",
    "$LinkSupported",
    "$LoadedFiles",
    "$LocalBase",
    "$LocalSymbolBase",
    "$MachineAddresses",
    "$MachineDomain",
    "$MachineDomains",
    "$MachineEpsilon",
    "$MachineID",
    "$MachineName",
    "$MachinePrecision",
    "$MachineType",
    "$MaxDisplayedChildren",
    "$MaxExtraPrecision",
    "$MaxLicenseProcesses",
    "$MaxLicenseSubprocesses",
    "$MaxMachineNumber",
    "$MaxNumber",
    "$MaxPiecewiseCases",
    "$MaxPrecision",
    "$MaxRootDegree",
    "$MessageGroups",
    "$MessageList",
    "$MessagePrePrint",
    "$Messages",
    "$MinMachineNumber",
    "$MinNumber",
    "$MinorReleaseNumber",
    "$MinPrecision",
    "$MobilePhone",
    "$ModuleNumber",
    "$NetworkConnected",
    "$NetworkInterfaces",
    "$NetworkLicense",
    "$NewMessage",
    "$NewSymbol",
    "$NotebookInlineStorageLimit",
    "$Notebooks",
    "$NoValue",
    "$NumberMarks",
    "$Off",
    "$OperatingSystem",
    "$Output",
    "$OutputForms",
    "$OutputSizeLimit",
    "$OutputStreamMethods",
    "$Packages",
    "$ParentLink",
    "$ParentProcessID",
    "$PasswordFile",
    "$PatchLevelID",
    "$Path",
    "$PathnameSeparator",
    "$PerformanceGoal",
    "$Permissions",
    "$PermissionsGroupBase",
    "$PersistenceBase",
    "$PersistencePath",
    "$PipeSupported",
    "$PlotTheme",
    "$Post",
    "$Pre",
    "$PreferencesDirectory",
    "$PreInitialization",
    "$PrePrint",
    "$PreRead",
    "$PrintForms",
    "$PrintLiteral",
    "$Printout3DPreviewer",
    "$ProcessID",
    "$ProcessorCount",
    "$ProcessorType",
    "$ProductInformation",
    "$ProgramName",
    "$ProgressReporting",
    "$PublisherID",
    "$RandomGeneratorState",
    "$RandomState",
    "$RecursionLimit",
    "$RegisteredDeviceClasses",
    "$RegisteredUserName",
    "$ReleaseNumber",
    "$RequesterAddress",
    "$RequesterCloudUserID",
    "$RequesterCloudUserUUID",
    "$RequesterWolframID",
    "$RequesterWolframUUID",
    "$ResourceSystemBase",
    "$ResourceSystemPath",
    "$RootDirectory",
    "$ScheduledTask",
    "$ScriptCommandLine",
    "$ScriptInputString",
    "$SecuredAuthenticationKeyTokens",
    "$ServiceCreditsAvailable",
    "$Services",
    "$SessionID",
    "$SetParentLink",
    "$SharedFunctions",
    "$SharedVariables",
    "$SoundDisplay",
    "$SoundDisplayFunction",
    "$SourceLink",
    "$SSHAuthentication",
    "$SubtitleDecoders",
    "$SubtitleEncoders",
    "$SummaryBoxDataSizeLimit",
    "$SuppressInputFormHeads",
    "$SynchronousEvaluation",
    "$SyntaxHandler",
    "$System",
    "$SystemCharacterEncoding",
    "$SystemCredentialStore",
    "$SystemID",
    "$SystemMemory",
    "$SystemShell",
    "$SystemTimeZone",
    "$SystemWordLength",
    "$TargetSystems",
    "$TemplatePath",
    "$TemporaryDirectory",
    "$TemporaryPrefix",
    "$TestFileName",
    "$TextStyle",
    "$TimedOut",
    "$TimeUnit",
    "$TimeZone",
    "$TimeZoneEntity",
    "$TopDirectory",
    "$TraceOff",
    "$TraceOn",
    "$TracePattern",
    "$TracePostAction",
    "$TracePreAction",
    "$UnitSystem",
    "$Urgent",
    "$UserAddOnsDirectory",
    "$UserAgentLanguages",
    "$UserAgentMachine",
    "$UserAgentName",
    "$UserAgentOperatingSystem",
    "$UserAgentString",
    "$UserAgentVersion",
    "$UserBaseDirectory",
    "$UserBasePacletsDirectory",
    "$UserDocumentsDirectory",
    "$Username",
    "$UserName",
    "$UserURLBase",
    "$Version",
    "$VersionNumber",
    "$VideoDecoders",
    "$VideoEncoders",
    "$VoiceStyles",
    "$WolframDocumentsDirectory",
    "$WolframID",
    "$WolframUUID"
  ];

  /*
  Language: Wolfram Language
  Description: The Wolfram Language is the programming language used in Wolfram Mathematica, a modern technical computing system spanning most areas of technical computing.
  Authors: Patrick Scheibe <patrick@halirutan.de>, Robert Jacobson <robertjacobson@acm.org>
  Website: https://www.wolfram.com/mathematica/
  Category: scientific
  */


  /** @type LanguageFn */
  function mathematica(hljs) {
    const regex = hljs.regex;
    /*
    This rather scary looking matching of Mathematica numbers is carefully explained by Robert Jacobson here:
    https://wltools.github.io/LanguageSpec/Specification/Syntax/Number-representations/
     */
    const BASE_RE = /([2-9]|[1-2]\d|[3][0-5])\^\^/;
    const BASE_DIGITS_RE = /(\w*\.\w+|\w+\.\w*|\w+)/;
    const NUMBER_RE = /(\d*\.\d+|\d+\.\d*|\d+)/;
    const BASE_NUMBER_RE = regex.either(regex.concat(BASE_RE, BASE_DIGITS_RE), NUMBER_RE);

    const ACCURACY_RE = /``[+-]?(\d*\.\d+|\d+\.\d*|\d+)/;
    const PRECISION_RE = /`([+-]?(\d*\.\d+|\d+\.\d*|\d+))?/;
    const APPROXIMATE_NUMBER_RE = regex.either(ACCURACY_RE, PRECISION_RE);

    const SCIENTIFIC_NOTATION_RE = /\*\^[+-]?\d+/;

    const MATHEMATICA_NUMBER_RE = regex.concat(
      BASE_NUMBER_RE,
      regex.optional(APPROXIMATE_NUMBER_RE),
      regex.optional(SCIENTIFIC_NOTATION_RE)
    );

    const NUMBERS = {
      className: 'number',
      relevance: 0,
      begin: MATHEMATICA_NUMBER_RE
    };

    const SYMBOL_RE = /[a-zA-Z$][a-zA-Z0-9$]*/;
    const SYSTEM_SYMBOLS_SET = new Set(SYSTEM_SYMBOLS);
    /** @type {Mode} */
    const SYMBOLS = { variants: [
      {
        className: 'builtin-symbol',
        begin: SYMBOL_RE,
        // for performance out of fear of regex.either(...Mathematica.SYSTEM_SYMBOLS)
        "on:begin": (match, response) => {
          if (!SYSTEM_SYMBOLS_SET.has(match[0])) response.ignoreMatch();
        }
      },
      {
        className: 'symbol',
        relevance: 0,
        begin: SYMBOL_RE
      }
    ] };

    const NAMED_CHARACTER = {
      className: 'named-character',
      begin: /\\\[[$a-zA-Z][$a-zA-Z0-9]+\]/
    };

    const OPERATORS = {
      className: 'operator',
      relevance: 0,
      begin: /[+\-*/,;.:@~=><&|_`'^?!%]+/
    };
    const PATTERNS = {
      className: 'pattern',
      relevance: 0,
      begin: /([a-zA-Z$][a-zA-Z0-9$]*)?_+([a-zA-Z$][a-zA-Z0-9$]*)?/
    };

    const SLOTS = {
      className: 'slot',
      relevance: 0,
      begin: /#[a-zA-Z$][a-zA-Z0-9$]*|#+[0-9]?/
    };

    const BRACES = {
      className: 'brace',
      relevance: 0,
      begin: /[[\](){}]/
    };

    const MESSAGES = {
      className: 'message-name',
      relevance: 0,
      begin: regex.concat("::", SYMBOL_RE)
    };

    return {
      name: 'Mathematica',
      aliases: [
        'mma',
        'wl'
      ],
      classNameAliases: {
        brace: 'punctuation',
        pattern: 'type',
        slot: 'type',
        symbol: 'variable',
        'named-character': 'variable',
        'builtin-symbol': 'built_in',
        'message-name': 'string'
      },
      contains: [
        hljs.COMMENT(/\(\*/, /\*\)/, { contains: [ 'self' ] }),
        PATTERNS,
        SLOTS,
        MESSAGES,
        SYMBOLS,
        NAMED_CHARACTER,
        hljs.QUOTE_STRING_MODE,
        NUMBERS,
        OPERATORS,
        BRACES
      ]
    };
  }

  return mathematica;

})();

    hljs.registerLanguage('mathematica', hljsGrammar);
  })();/*! `matlab` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Matlab
  Author: Denis Bardadym <bardadymchik@gmail.com>
  Contributors: Eugene Nizhibitsky <nizhibitsky@ya.ru>, Egor Rogov <e.rogov@postgrespro.ru>
  Website: https://www.mathworks.com/products/matlab.html
  Category: scientific
  */

  /*
    Formal syntax is not published, helpful link:
    https://github.com/kornilova-l/matlab-IntelliJ-plugin/blob/master/src/main/grammar/Matlab.bnf
  */
  function matlab(hljs) {
    const TRANSPOSE_RE = '(\'|\\.\')+';
    const TRANSPOSE = {
      relevance: 0,
      contains: [ { begin: TRANSPOSE_RE } ]
    };

    return {
      name: 'Matlab',
      keywords: {
        keyword:
          'arguments break case catch classdef continue else elseif end enumeration events for function '
          + 'global if methods otherwise parfor persistent properties return spmd switch try while',
        built_in:
          'sin sind sinh asin asind asinh cos cosd cosh acos acosd acosh tan tand tanh atan '
          + 'atand atan2 atanh sec secd sech asec asecd asech csc cscd csch acsc acscd acsch cot '
          + 'cotd coth acot acotd acoth hypot exp expm1 log log1p log10 log2 pow2 realpow reallog '
          + 'realsqrt sqrt nthroot nextpow2 abs angle complex conj imag real unwrap isreal '
          + 'cplxpair fix floor ceil round mod rem sign airy besselj bessely besselh besseli '
          + 'besselk beta betainc betaln ellipj ellipke erf erfc erfcx erfinv expint gamma '
          + 'gammainc gammaln psi legendre cross dot factor isprime primes gcd lcm rat rats perms '
          + 'nchoosek factorial cart2sph cart2pol pol2cart sph2cart hsv2rgb rgb2hsv zeros ones '
          + 'eye repmat rand randn linspace logspace freqspace meshgrid accumarray size length '
          + 'ndims numel disp isempty isequal isequalwithequalnans cat reshape diag blkdiag tril '
          + 'triu fliplr flipud flipdim rot90 find sub2ind ind2sub bsxfun ndgrid permute ipermute '
          + 'shiftdim circshift squeeze isscalar isvector ans eps realmax realmin pi i|0 inf nan '
          + 'isnan isinf isfinite j|0 why compan gallery hadamard hankel hilb invhilb magic pascal '
          + 'rosser toeplitz vander wilkinson max min nanmax nanmin mean nanmean type table '
          + 'readtable writetable sortrows sort figure plot plot3 scatter scatter3 cellfun '
          + 'legend intersect ismember procrustes hold num2cell '
      },
      illegal: '(//|"|#|/\\*|\\s+/\\w+)',
      contains: [
        {
          className: 'function',
          beginKeywords: 'function',
          end: '$',
          contains: [
            hljs.UNDERSCORE_TITLE_MODE,
            {
              className: 'params',
              variants: [
                {
                  begin: '\\(',
                  end: '\\)'
                },
                {
                  begin: '\\[',
                  end: '\\]'
                }
              ]
            }
          ]
        },
        {
          className: 'built_in',
          begin: /true|false/,
          relevance: 0,
          starts: TRANSPOSE
        },
        {
          begin: '[a-zA-Z][a-zA-Z_0-9]*' + TRANSPOSE_RE,
          relevance: 0
        },
        {
          className: 'number',
          begin: hljs.C_NUMBER_RE,
          relevance: 0,
          starts: TRANSPOSE
        },
        {
          className: 'string',
          begin: '\'',
          end: '\'',
          contains: [ { begin: '\'\'' } ]
        },
        {
          begin: /\]|\}|\)/,
          relevance: 0,
          starts: TRANSPOSE
        },
        {
          className: 'string',
          begin: '"',
          end: '"',
          contains: [ { begin: '""' } ],
          starts: TRANSPOSE
        },
        hljs.COMMENT('^\\s*%\\{\\s*$', '^\\s*%\\}\\s*$'),
        hljs.COMMENT('%', '$')
      ]
    };
  }

  return matlab;

})();

    hljs.registerLanguage('matlab', hljsGrammar);
  })();/*! `nginx` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Nginx config
  Author: Peter Leonov <gojpeg@yandex.ru>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Category: config, web
  Website: https://www.nginx.com
  */

  /** @type LanguageFn */
  function nginx(hljs) {
    const regex = hljs.regex;
    const VAR = {
      className: 'variable',
      variants: [
        { begin: /\$\d+/ },
        { begin: /\$\{\w+\}/ },
        { begin: regex.concat(/[$@]/, hljs.UNDERSCORE_IDENT_RE) }
      ]
    };
    const LITERALS = [
      "on",
      "off",
      "yes",
      "no",
      "true",
      "false",
      "none",
      "blocked",
      "debug",
      "info",
      "notice",
      "warn",
      "error",
      "crit",
      "select",
      "break",
      "last",
      "permanent",
      "redirect",
      "kqueue",
      "rtsig",
      "epoll",
      "poll",
      "/dev/poll"
    ];
    const DEFAULT = {
      endsWithParent: true,
      keywords: {
        $pattern: /[a-z_]{2,}|\/dev\/poll/,
        literal: LITERALS
      },
      relevance: 0,
      illegal: '=>',
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          className: 'string',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            VAR
          ],
          variants: [
            {
              begin: /"/,
              end: /"/
            },
            {
              begin: /'/,
              end: /'/
            }
          ]
        },
        // this swallows entire URLs to avoid detecting numbers within
        {
          begin: '([a-z]+):/',
          end: '\\s',
          endsWithParent: true,
          excludeEnd: true,
          contains: [ VAR ]
        },
        {
          className: 'regexp',
          contains: [
            hljs.BACKSLASH_ESCAPE,
            VAR
          ],
          variants: [
            {
              begin: "\\s\\^",
              end: "\\s|\\{|;",
              returnEnd: true
            },
            // regexp locations (~, ~*)
            {
              begin: "~\\*?\\s+",
              end: "\\s|\\{|;",
              returnEnd: true
            },
            // *.example.com
            { begin: "\\*(\\.[a-z\\-]+)+" },
            // sub.example.*
            { begin: "([a-z\\-]+\\.)+\\*" }
          ]
        },
        // IP
        {
          className: 'number',
          begin: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?\\b'
        },
        // units
        {
          className: 'number',
          begin: '\\b\\d+[kKmMgGdshdwy]?\\b',
          relevance: 0
        },
        VAR
      ]
    };

    return {
      name: 'Nginx config',
      aliases: [ 'nginxconf' ],
      contains: [
        hljs.HASH_COMMENT_MODE,
        {
          beginKeywords: "upstream location",
          end: /;|\{/,
          contains: DEFAULT.contains,
          keywords: { section: "upstream location" }
        },
        {
          className: 'section',
          begin: regex.concat(hljs.UNDERSCORE_IDENT_RE + regex.lookahead(/\s+\{/)),
          relevance: 0
        },
        {
          begin: regex.lookahead(hljs.UNDERSCORE_IDENT_RE + '\\s'),
          end: ';|\\{',
          contains: [
            {
              className: 'attribute',
              begin: hljs.UNDERSCORE_IDENT_RE,
              starts: DEFAULT
            }
          ],
          relevance: 0
        }
      ],
      illegal: '[^\\s\\}\\{]'
    };
  }

  return nginx;

})();

    hljs.registerLanguage('nginx', hljsGrammar);
  })();/*! `objectivec` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Objective-C
  Author: Valerii Hiora <valerii.hiora@gmail.com>
  Contributors: Angel G. Olloqui <angelgarcia.mail@gmail.com>, Matt Diephouse <matt@diephouse.com>, Andrew Farmer <ahfarmer@gmail.com>, Minh Nguyễn <mxn@1ec5.org>
  Website: https://developer.apple.com/documentation/objectivec
  Category: common
  */

  function objectivec(hljs) {
    const API_CLASS = {
      className: 'built_in',
      begin: '\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+'
    };
    const IDENTIFIER_RE = /[a-zA-Z@][a-zA-Z0-9_]*/;
    const TYPES = [
      "int",
      "float",
      "char",
      "unsigned",
      "signed",
      "short",
      "long",
      "double",
      "wchar_t",
      "unichar",
      "void",
      "bool",
      "BOOL",
      "id|0",
      "_Bool"
    ];
    const KWS = [
      "while",
      "export",
      "sizeof",
      "typedef",
      "const",
      "struct",
      "for",
      "union",
      "volatile",
      "static",
      "mutable",
      "if",
      "do",
      "return",
      "goto",
      "enum",
      "else",
      "break",
      "extern",
      "asm",
      "case",
      "default",
      "register",
      "explicit",
      "typename",
      "switch",
      "continue",
      "inline",
      "readonly",
      "assign",
      "readwrite",
      "self",
      "@synchronized",
      "id",
      "typeof",
      "nonatomic",
      "IBOutlet",
      "IBAction",
      "strong",
      "weak",
      "copy",
      "in",
      "out",
      "inout",
      "bycopy",
      "byref",
      "oneway",
      "__strong",
      "__weak",
      "__block",
      "__autoreleasing",
      "@private",
      "@protected",
      "@public",
      "@try",
      "@property",
      "@end",
      "@throw",
      "@catch",
      "@finally",
      "@autoreleasepool",
      "@synthesize",
      "@dynamic",
      "@selector",
      "@optional",
      "@required",
      "@encode",
      "@package",
      "@import",
      "@defs",
      "@compatibility_alias",
      "__bridge",
      "__bridge_transfer",
      "__bridge_retained",
      "__bridge_retain",
      "__covariant",
      "__contravariant",
      "__kindof",
      "_Nonnull",
      "_Nullable",
      "_Null_unspecified",
      "__FUNCTION__",
      "__PRETTY_FUNCTION__",
      "__attribute__",
      "getter",
      "setter",
      "retain",
      "unsafe_unretained",
      "nonnull",
      "nullable",
      "null_unspecified",
      "null_resettable",
      "class",
      "instancetype",
      "NS_DESIGNATED_INITIALIZER",
      "NS_UNAVAILABLE",
      "NS_REQUIRES_SUPER",
      "NS_RETURNS_INNER_POINTER",
      "NS_INLINE",
      "NS_AVAILABLE",
      "NS_DEPRECATED",
      "NS_ENUM",
      "NS_OPTIONS",
      "NS_SWIFT_UNAVAILABLE",
      "NS_ASSUME_NONNULL_BEGIN",
      "NS_ASSUME_NONNULL_END",
      "NS_REFINED_FOR_SWIFT",
      "NS_SWIFT_NAME",
      "NS_SWIFT_NOTHROW",
      "NS_DURING",
      "NS_HANDLER",
      "NS_ENDHANDLER",
      "NS_VALUERETURN",
      "NS_VOIDRETURN"
    ];
    const LITERALS = [
      "false",
      "true",
      "FALSE",
      "TRUE",
      "nil",
      "YES",
      "NO",
      "NULL"
    ];
    const BUILT_INS = [
      "dispatch_once_t",
      "dispatch_queue_t",
      "dispatch_sync",
      "dispatch_async",
      "dispatch_once"
    ];
    const KEYWORDS = {
      "variable.language": [
        "this",
        "super"
      ],
      $pattern: IDENTIFIER_RE,
      keyword: KWS,
      literal: LITERALS,
      built_in: BUILT_INS,
      type: TYPES
    };
    const CLASS_KEYWORDS = {
      $pattern: IDENTIFIER_RE,
      keyword: [
        "@interface",
        "@class",
        "@protocol",
        "@implementation"
      ]
    };
    return {
      name: 'Objective-C',
      aliases: [
        'mm',
        'objc',
        'obj-c',
        'obj-c++',
        'objective-c++'
      ],
      keywords: KEYWORDS,
      illegal: '</',
      contains: [
        API_CLASS,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_NUMBER_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        {
          className: 'string',
          variants: [
            {
              begin: '@"',
              end: '"',
              illegal: '\\n',
              contains: [ hljs.BACKSLASH_ESCAPE ]
            }
          ]
        },
        {
          className: 'meta',
          begin: /#\s*[a-z]+\b/,
          end: /$/,
          keywords: { keyword:
              'if else elif endif define undef warning error line '
              + 'pragma ifdef ifndef include' },
          contains: [
            {
              begin: /\\\n/,
              relevance: 0
            },
            hljs.inherit(hljs.QUOTE_STRING_MODE, { className: 'string' }),
            {
              className: 'string',
              begin: /<.*?>/,
              end: /$/,
              illegal: '\\n'
            },
            hljs.C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE
          ]
        },
        {
          className: 'class',
          begin: '(' + CLASS_KEYWORDS.keyword.join('|') + ')\\b',
          end: /(\{|$)/,
          excludeEnd: true,
          keywords: CLASS_KEYWORDS,
          contains: [ hljs.UNDERSCORE_TITLE_MODE ]
        },
        {
          begin: '\\.' + hljs.UNDERSCORE_IDENT_RE,
          relevance: 0
        }
      ]
    };
  }

  return objectivec;

})();

    hljs.registerLanguage('objectivec', hljsGrammar);
  })();/*! `pgsql` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PostgreSQL and PL/pgSQL
  Author: Egor Rogov (e.rogov@postgrespro.ru)
  Website: https://www.postgresql.org/docs/11/sql.html
  Description:
      This language incorporates both PostgreSQL SQL dialect and PL/pgSQL language.
      It is based on PostgreSQL version 11. Some notes:
      - Text in double-dollar-strings is _always_ interpreted as some programming code. Text
        in ordinary quotes is _never_ interpreted that way and highlighted just as a string.
      - There are quite a bit "special cases". That's because many keywords are not strictly
        they are keywords in some contexts and ordinary identifiers in others. Only some
        of such cases are handled; you still can get some of your identifiers highlighted
        wrong way.
      - Function names deliberately are not highlighted. There is no way to tell function
        call from other constructs, hence we can't highlight _all_ function names. And
        some names highlighted while others not looks ugly.
  Category: database
  */

  function pgsql(hljs) {
    const COMMENT_MODE = hljs.COMMENT('--', '$');
    const UNQUOTED_IDENT = '[a-zA-Z_][a-zA-Z_0-9$]*';
    const DOLLAR_STRING = '\\$([a-zA-Z_]?|[a-zA-Z_][a-zA-Z_0-9]*)\\$';
    const LABEL = '<<\\s*' + UNQUOTED_IDENT + '\\s*>>';

    const SQL_KW =
      // https://www.postgresql.org/docs/11/static/sql-keywords-appendix.html
      // https://www.postgresql.org/docs/11/static/sql-commands.html
      // SQL commands (starting words)
      'ABORT ALTER ANALYZE BEGIN CALL CHECKPOINT|10 CLOSE CLUSTER COMMENT COMMIT COPY CREATE DEALLOCATE DECLARE '
      + 'DELETE DISCARD DO DROP END EXECUTE EXPLAIN FETCH GRANT IMPORT INSERT LISTEN LOAD LOCK MOVE NOTIFY '
      + 'PREPARE REASSIGN|10 REFRESH REINDEX RELEASE RESET REVOKE ROLLBACK SAVEPOINT SECURITY SELECT SET SHOW '
      + 'START TRUNCATE UNLISTEN|10 UPDATE VACUUM|10 VALUES '
      // SQL commands (others)
      + 'AGGREGATE COLLATION CONVERSION|10 DATABASE DEFAULT PRIVILEGES DOMAIN TRIGGER EXTENSION FOREIGN '
      + 'WRAPPER|10 TABLE FUNCTION GROUP LANGUAGE LARGE OBJECT MATERIALIZED VIEW OPERATOR CLASS '
      + 'FAMILY POLICY PUBLICATION|10 ROLE RULE SCHEMA SEQUENCE SERVER STATISTICS SUBSCRIPTION SYSTEM '
      + 'TABLESPACE CONFIGURATION DICTIONARY PARSER TEMPLATE TYPE USER MAPPING PREPARED ACCESS '
      + 'METHOD CAST AS TRANSFORM TRANSACTION OWNED TO INTO SESSION AUTHORIZATION '
      + 'INDEX PROCEDURE ASSERTION '
      // additional reserved key words
      + 'ALL ANALYSE AND ANY ARRAY ASC ASYMMETRIC|10 BOTH CASE CHECK '
      + 'COLLATE COLUMN CONCURRENTLY|10 CONSTRAINT CROSS '
      + 'DEFERRABLE RANGE '
      + 'DESC DISTINCT ELSE EXCEPT FOR FREEZE|10 FROM FULL HAVING '
      + 'ILIKE IN INITIALLY INNER INTERSECT IS ISNULL JOIN LATERAL LEADING LIKE LIMIT '
      + 'NATURAL NOT NOTNULL NULL OFFSET ON ONLY OR ORDER OUTER OVERLAPS PLACING PRIMARY '
      + 'REFERENCES RETURNING SIMILAR SOME SYMMETRIC TABLESAMPLE THEN '
      + 'TRAILING UNION UNIQUE USING VARIADIC|10 VERBOSE WHEN WHERE WINDOW WITH '
      // some of non-reserved (which are used in clauses or as PL/pgSQL keyword)
      + 'BY RETURNS INOUT OUT SETOF|10 IF STRICT CURRENT CONTINUE OWNER LOCATION OVER PARTITION WITHIN '
      + 'BETWEEN ESCAPE EXTERNAL INVOKER DEFINER WORK RENAME VERSION CONNECTION CONNECT '
      + 'TABLES TEMP TEMPORARY FUNCTIONS SEQUENCES TYPES SCHEMAS OPTION CASCADE RESTRICT ADD ADMIN '
      + 'EXISTS VALID VALIDATE ENABLE DISABLE REPLICA|10 ALWAYS PASSING COLUMNS PATH '
      + 'REF VALUE OVERRIDING IMMUTABLE STABLE VOLATILE BEFORE AFTER EACH ROW PROCEDURAL '
      + 'ROUTINE NO HANDLER VALIDATOR OPTIONS STORAGE OIDS|10 WITHOUT INHERIT DEPENDS CALLED '
      + 'INPUT LEAKPROOF|10 COST ROWS NOWAIT SEARCH UNTIL ENCRYPTED|10 PASSWORD CONFLICT|10 '
      + 'INSTEAD INHERITS CHARACTERISTICS WRITE CURSOR ALSO STATEMENT SHARE EXCLUSIVE INLINE '
      + 'ISOLATION REPEATABLE READ COMMITTED SERIALIZABLE UNCOMMITTED LOCAL GLOBAL SQL PROCEDURES '
      + 'RECURSIVE SNAPSHOT ROLLUP CUBE TRUSTED|10 INCLUDE FOLLOWING PRECEDING UNBOUNDED RANGE GROUPS '
      + 'UNENCRYPTED|10 SYSID FORMAT DELIMITER HEADER QUOTE ENCODING FILTER OFF '
      // some parameters of VACUUM/ANALYZE/EXPLAIN
      + 'FORCE_QUOTE FORCE_NOT_NULL FORCE_NULL COSTS BUFFERS TIMING SUMMARY DISABLE_PAGE_SKIPPING '
      //
      + 'RESTART CYCLE GENERATED IDENTITY DEFERRED IMMEDIATE LEVEL LOGGED UNLOGGED '
      + 'OF NOTHING NONE EXCLUDE ATTRIBUTE '
      // from GRANT (not keywords actually)
      + 'USAGE ROUTINES '
      // actually literals, but look better this way (due to IS TRUE, IS FALSE, ISNULL etc)
      + 'TRUE FALSE NAN INFINITY ';

    const ROLE_ATTRS = // only those not in keywrods already
      'SUPERUSER NOSUPERUSER CREATEDB NOCREATEDB CREATEROLE NOCREATEROLE INHERIT NOINHERIT '
      + 'LOGIN NOLOGIN REPLICATION NOREPLICATION BYPASSRLS NOBYPASSRLS ';

    const PLPGSQL_KW =
      'ALIAS BEGIN CONSTANT DECLARE END EXCEPTION RETURN PERFORM|10 RAISE GET DIAGNOSTICS '
      + 'STACKED|10 FOREACH LOOP ELSIF EXIT WHILE REVERSE SLICE DEBUG LOG INFO NOTICE WARNING ASSERT '
      + 'OPEN ';

    const TYPES =
      // https://www.postgresql.org/docs/11/static/datatype.html
      'BIGINT INT8 BIGSERIAL SERIAL8 BIT VARYING VARBIT BOOLEAN BOOL BOX BYTEA CHARACTER CHAR VARCHAR '
      + 'CIDR CIRCLE DATE DOUBLE PRECISION FLOAT8 FLOAT INET INTEGER INT INT4 INTERVAL JSON JSONB LINE LSEG|10 '
      + 'MACADDR MACADDR8 MONEY NUMERIC DEC DECIMAL PATH POINT POLYGON REAL FLOAT4 SMALLINT INT2 '
      + 'SMALLSERIAL|10 SERIAL2|10 SERIAL|10 SERIAL4|10 TEXT TIME ZONE TIMETZ|10 TIMESTAMP TIMESTAMPTZ|10 TSQUERY|10 TSVECTOR|10 '
      + 'TXID_SNAPSHOT|10 UUID XML NATIONAL NCHAR '
      + 'INT4RANGE|10 INT8RANGE|10 NUMRANGE|10 TSRANGE|10 TSTZRANGE|10 DATERANGE|10 '
      // pseudotypes
      + 'ANYELEMENT ANYARRAY ANYNONARRAY ANYENUM ANYRANGE CSTRING INTERNAL '
      + 'RECORD PG_DDL_COMMAND VOID UNKNOWN OPAQUE REFCURSOR '
      // spec. type
      + 'NAME '
      // OID-types
      + 'OID REGPROC|10 REGPROCEDURE|10 REGOPER|10 REGOPERATOR|10 REGCLASS|10 REGTYPE|10 REGROLE|10 '
      + 'REGNAMESPACE|10 REGCONFIG|10 REGDICTIONARY|10 ';// +

    const TYPES_RE =
      TYPES.trim()
        .split(' ')
        .map(function(val) { return val.split('|')[0]; })
        .join('|');

    const SQL_BI =
      'CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER CURRENT_CATALOG|10 CURRENT_DATE LOCALTIME LOCALTIMESTAMP '
      + 'CURRENT_ROLE|10 CURRENT_SCHEMA|10 SESSION_USER PUBLIC ';

    const PLPGSQL_BI =
      'FOUND NEW OLD TG_NAME|10 TG_WHEN|10 TG_LEVEL|10 TG_OP|10 TG_RELID|10 TG_RELNAME|10 '
      + 'TG_TABLE_NAME|10 TG_TABLE_SCHEMA|10 TG_NARGS|10 TG_ARGV|10 TG_EVENT|10 TG_TAG|10 '
      // get diagnostics
      + 'ROW_COUNT RESULT_OID|10 PG_CONTEXT|10 RETURNED_SQLSTATE COLUMN_NAME CONSTRAINT_NAME '
      + 'PG_DATATYPE_NAME|10 MESSAGE_TEXT TABLE_NAME SCHEMA_NAME PG_EXCEPTION_DETAIL|10 '
      + 'PG_EXCEPTION_HINT|10 PG_EXCEPTION_CONTEXT|10 ';

    const PLPGSQL_EXCEPTIONS =
      // exceptions https://www.postgresql.org/docs/current/static/errcodes-appendix.html
      'SQLSTATE SQLERRM|10 '
      + 'SUCCESSFUL_COMPLETION WARNING DYNAMIC_RESULT_SETS_RETURNED IMPLICIT_ZERO_BIT_PADDING '
      + 'NULL_VALUE_ELIMINATED_IN_SET_FUNCTION PRIVILEGE_NOT_GRANTED PRIVILEGE_NOT_REVOKED '
      + 'STRING_DATA_RIGHT_TRUNCATION DEPRECATED_FEATURE NO_DATA NO_ADDITIONAL_DYNAMIC_RESULT_SETS_RETURNED '
      + 'SQL_STATEMENT_NOT_YET_COMPLETE CONNECTION_EXCEPTION CONNECTION_DOES_NOT_EXIST CONNECTION_FAILURE '
      + 'SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION '
      + 'TRANSACTION_RESOLUTION_UNKNOWN PROTOCOL_VIOLATION TRIGGERED_ACTION_EXCEPTION FEATURE_NOT_SUPPORTED '
      + 'INVALID_TRANSACTION_INITIATION LOCATOR_EXCEPTION INVALID_LOCATOR_SPECIFICATION INVALID_GRANTOR '
      + 'INVALID_GRANT_OPERATION INVALID_ROLE_SPECIFICATION DIAGNOSTICS_EXCEPTION '
      + 'STACKED_DIAGNOSTICS_ACCESSED_WITHOUT_ACTIVE_HANDLER CASE_NOT_FOUND CARDINALITY_VIOLATION '
      + 'DATA_EXCEPTION ARRAY_SUBSCRIPT_ERROR CHARACTER_NOT_IN_REPERTOIRE DATETIME_FIELD_OVERFLOW '
      + 'DIVISION_BY_ZERO ERROR_IN_ASSIGNMENT ESCAPE_CHARACTER_CONFLICT INDICATOR_OVERFLOW '
      + 'INTERVAL_FIELD_OVERFLOW INVALID_ARGUMENT_FOR_LOGARITHM INVALID_ARGUMENT_FOR_NTILE_FUNCTION '
      + 'INVALID_ARGUMENT_FOR_NTH_VALUE_FUNCTION INVALID_ARGUMENT_FOR_POWER_FUNCTION '
      + 'INVALID_ARGUMENT_FOR_WIDTH_BUCKET_FUNCTION INVALID_CHARACTER_VALUE_FOR_CAST '
      + 'INVALID_DATETIME_FORMAT INVALID_ESCAPE_CHARACTER INVALID_ESCAPE_OCTET INVALID_ESCAPE_SEQUENCE '
      + 'NONSTANDARD_USE_OF_ESCAPE_CHARACTER INVALID_INDICATOR_PARAMETER_VALUE INVALID_PARAMETER_VALUE '
      + 'INVALID_REGULAR_EXPRESSION INVALID_ROW_COUNT_IN_LIMIT_CLAUSE '
      + 'INVALID_ROW_COUNT_IN_RESULT_OFFSET_CLAUSE INVALID_TABLESAMPLE_ARGUMENT INVALID_TABLESAMPLE_REPEAT '
      + 'INVALID_TIME_ZONE_DISPLACEMENT_VALUE INVALID_USE_OF_ESCAPE_CHARACTER MOST_SPECIFIC_TYPE_MISMATCH '
      + 'NULL_VALUE_NOT_ALLOWED NULL_VALUE_NO_INDICATOR_PARAMETER NUMERIC_VALUE_OUT_OF_RANGE '
      + 'SEQUENCE_GENERATOR_LIMIT_EXCEEDED STRING_DATA_LENGTH_MISMATCH STRING_DATA_RIGHT_TRUNCATION '
      + 'SUBSTRING_ERROR TRIM_ERROR UNTERMINATED_C_STRING ZERO_LENGTH_CHARACTER_STRING '
      + 'FLOATING_POINT_EXCEPTION INVALID_TEXT_REPRESENTATION INVALID_BINARY_REPRESENTATION '
      + 'BAD_COPY_FILE_FORMAT UNTRANSLATABLE_CHARACTER NOT_AN_XML_DOCUMENT INVALID_XML_DOCUMENT '
      + 'INVALID_XML_CONTENT INVALID_XML_COMMENT INVALID_XML_PROCESSING_INSTRUCTION '
      + 'INTEGRITY_CONSTRAINT_VIOLATION RESTRICT_VIOLATION NOT_NULL_VIOLATION FOREIGN_KEY_VIOLATION '
      + 'UNIQUE_VIOLATION CHECK_VIOLATION EXCLUSION_VIOLATION INVALID_CURSOR_STATE '
      + 'INVALID_TRANSACTION_STATE ACTIVE_SQL_TRANSACTION BRANCH_TRANSACTION_ALREADY_ACTIVE '
      + 'HELD_CURSOR_REQUIRES_SAME_ISOLATION_LEVEL INAPPROPRIATE_ACCESS_MODE_FOR_BRANCH_TRANSACTION '
      + 'INAPPROPRIATE_ISOLATION_LEVEL_FOR_BRANCH_TRANSACTION '
      + 'NO_ACTIVE_SQL_TRANSACTION_FOR_BRANCH_TRANSACTION READ_ONLY_SQL_TRANSACTION '
      + 'SCHEMA_AND_DATA_STATEMENT_MIXING_NOT_SUPPORTED NO_ACTIVE_SQL_TRANSACTION '
      + 'IN_FAILED_SQL_TRANSACTION IDLE_IN_TRANSACTION_SESSION_TIMEOUT INVALID_SQL_STATEMENT_NAME '
      + 'TRIGGERED_DATA_CHANGE_VIOLATION INVALID_AUTHORIZATION_SPECIFICATION INVALID_PASSWORD '
      + 'DEPENDENT_PRIVILEGE_DESCRIPTORS_STILL_EXIST DEPENDENT_OBJECTS_STILL_EXIST '
      + 'INVALID_TRANSACTION_TERMINATION SQL_ROUTINE_EXCEPTION FUNCTION_EXECUTED_NO_RETURN_STATEMENT '
      + 'MODIFYING_SQL_DATA_NOT_PERMITTED PROHIBITED_SQL_STATEMENT_ATTEMPTED '
      + 'READING_SQL_DATA_NOT_PERMITTED INVALID_CURSOR_NAME EXTERNAL_ROUTINE_EXCEPTION '
      + 'CONTAINING_SQL_NOT_PERMITTED MODIFYING_SQL_DATA_NOT_PERMITTED '
      + 'PROHIBITED_SQL_STATEMENT_ATTEMPTED READING_SQL_DATA_NOT_PERMITTED '
      + 'EXTERNAL_ROUTINE_INVOCATION_EXCEPTION INVALID_SQLSTATE_RETURNED NULL_VALUE_NOT_ALLOWED '
      + 'TRIGGER_PROTOCOL_VIOLATED SRF_PROTOCOL_VIOLATED EVENT_TRIGGER_PROTOCOL_VIOLATED '
      + 'SAVEPOINT_EXCEPTION INVALID_SAVEPOINT_SPECIFICATION INVALID_CATALOG_NAME '
      + 'INVALID_SCHEMA_NAME TRANSACTION_ROLLBACK TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION '
      + 'SERIALIZATION_FAILURE STATEMENT_COMPLETION_UNKNOWN DEADLOCK_DETECTED '
      + 'SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION SYNTAX_ERROR INSUFFICIENT_PRIVILEGE CANNOT_COERCE '
      + 'GROUPING_ERROR WINDOWING_ERROR INVALID_RECURSION INVALID_FOREIGN_KEY INVALID_NAME '
      + 'NAME_TOO_LONG RESERVED_NAME DATATYPE_MISMATCH INDETERMINATE_DATATYPE COLLATION_MISMATCH '
      + 'INDETERMINATE_COLLATION WRONG_OBJECT_TYPE GENERATED_ALWAYS UNDEFINED_COLUMN '
      + 'UNDEFINED_FUNCTION UNDEFINED_TABLE UNDEFINED_PARAMETER UNDEFINED_OBJECT '
      + 'DUPLICATE_COLUMN DUPLICATE_CURSOR DUPLICATE_DATABASE DUPLICATE_FUNCTION '
      + 'DUPLICATE_PREPARED_STATEMENT DUPLICATE_SCHEMA DUPLICATE_TABLE DUPLICATE_ALIAS '
      + 'DUPLICATE_OBJECT AMBIGUOUS_COLUMN AMBIGUOUS_FUNCTION AMBIGUOUS_PARAMETER AMBIGUOUS_ALIAS '
      + 'INVALID_COLUMN_REFERENCE INVALID_COLUMN_DEFINITION INVALID_CURSOR_DEFINITION '
      + 'INVALID_DATABASE_DEFINITION INVALID_FUNCTION_DEFINITION '
      + 'INVALID_PREPARED_STATEMENT_DEFINITION INVALID_SCHEMA_DEFINITION INVALID_TABLE_DEFINITION '
      + 'INVALID_OBJECT_DEFINITION WITH_CHECK_OPTION_VIOLATION INSUFFICIENT_RESOURCES DISK_FULL '
      + 'OUT_OF_MEMORY TOO_MANY_CONNECTIONS CONFIGURATION_LIMIT_EXCEEDED PROGRAM_LIMIT_EXCEEDED '
      + 'STATEMENT_TOO_COMPLEX TOO_MANY_COLUMNS TOO_MANY_ARGUMENTS OBJECT_NOT_IN_PREREQUISITE_STATE '
      + 'OBJECT_IN_USE CANT_CHANGE_RUNTIME_PARAM LOCK_NOT_AVAILABLE OPERATOR_INTERVENTION '
      + 'QUERY_CANCELED ADMIN_SHUTDOWN CRASH_SHUTDOWN CANNOT_CONNECT_NOW DATABASE_DROPPED '
      + 'SYSTEM_ERROR IO_ERROR UNDEFINED_FILE DUPLICATE_FILE SNAPSHOT_TOO_OLD CONFIG_FILE_ERROR '
      + 'LOCK_FILE_EXISTS FDW_ERROR FDW_COLUMN_NAME_NOT_FOUND FDW_DYNAMIC_PARAMETER_VALUE_NEEDED '
      + 'FDW_FUNCTION_SEQUENCE_ERROR FDW_INCONSISTENT_DESCRIPTOR_INFORMATION '
      + 'FDW_INVALID_ATTRIBUTE_VALUE FDW_INVALID_COLUMN_NAME FDW_INVALID_COLUMN_NUMBER '
      + 'FDW_INVALID_DATA_TYPE FDW_INVALID_DATA_TYPE_DESCRIPTORS '
      + 'FDW_INVALID_DESCRIPTOR_FIELD_IDENTIFIER FDW_INVALID_HANDLE FDW_INVALID_OPTION_INDEX '
      + 'FDW_INVALID_OPTION_NAME FDW_INVALID_STRING_LENGTH_OR_BUFFER_LENGTH '
      + 'FDW_INVALID_STRING_FORMAT FDW_INVALID_USE_OF_NULL_POINTER FDW_TOO_MANY_HANDLES '
      + 'FDW_OUT_OF_MEMORY FDW_NO_SCHEMAS FDW_OPTION_NAME_NOT_FOUND FDW_REPLY_HANDLE '
      + 'FDW_SCHEMA_NOT_FOUND FDW_TABLE_NOT_FOUND FDW_UNABLE_TO_CREATE_EXECUTION '
      + 'FDW_UNABLE_TO_CREATE_REPLY FDW_UNABLE_TO_ESTABLISH_CONNECTION PLPGSQL_ERROR '
      + 'RAISE_EXCEPTION NO_DATA_FOUND TOO_MANY_ROWS ASSERT_FAILURE INTERNAL_ERROR DATA_CORRUPTED '
      + 'INDEX_CORRUPTED ';

    const FUNCTIONS =
      // https://www.postgresql.org/docs/11/static/functions-aggregate.html
      'ARRAY_AGG AVG BIT_AND BIT_OR BOOL_AND BOOL_OR COUNT EVERY JSON_AGG JSONB_AGG JSON_OBJECT_AGG '
      + 'JSONB_OBJECT_AGG MAX MIN MODE STRING_AGG SUM XMLAGG '
      + 'CORR COVAR_POP COVAR_SAMP REGR_AVGX REGR_AVGY REGR_COUNT REGR_INTERCEPT REGR_R2 REGR_SLOPE '
      + 'REGR_SXX REGR_SXY REGR_SYY STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP '
      + 'PERCENTILE_CONT PERCENTILE_DISC '
      // https://www.postgresql.org/docs/11/static/functions-window.html
      + 'ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE '
      // https://www.postgresql.org/docs/11/static/functions-comparison.html
      + 'NUM_NONNULLS NUM_NULLS '
      // https://www.postgresql.org/docs/11/static/functions-math.html
      + 'ABS CBRT CEIL CEILING DEGREES DIV EXP FLOOR LN LOG MOD PI POWER RADIANS ROUND SCALE SIGN SQRT '
      + 'TRUNC WIDTH_BUCKET '
      + 'RANDOM SETSEED '
      + 'ACOS ACOSD ASIN ASIND ATAN ATAND ATAN2 ATAN2D COS COSD COT COTD SIN SIND TAN TAND '
      // https://www.postgresql.org/docs/11/static/functions-string.html
      + 'BIT_LENGTH CHAR_LENGTH CHARACTER_LENGTH LOWER OCTET_LENGTH OVERLAY POSITION SUBSTRING TREAT TRIM UPPER '
      + 'ASCII BTRIM CHR CONCAT CONCAT_WS CONVERT CONVERT_FROM CONVERT_TO DECODE ENCODE INITCAP '
      + 'LEFT LENGTH LPAD LTRIM MD5 PARSE_IDENT PG_CLIENT_ENCODING QUOTE_IDENT|10 QUOTE_LITERAL|10 '
      + 'QUOTE_NULLABLE|10 REGEXP_MATCH REGEXP_MATCHES REGEXP_REPLACE REGEXP_SPLIT_TO_ARRAY '
      + 'REGEXP_SPLIT_TO_TABLE REPEAT REPLACE REVERSE RIGHT RPAD RTRIM SPLIT_PART STRPOS SUBSTR '
      + 'TO_ASCII TO_HEX TRANSLATE '
      // https://www.postgresql.org/docs/11/static/functions-binarystring.html
      + 'OCTET_LENGTH GET_BIT GET_BYTE SET_BIT SET_BYTE '
      // https://www.postgresql.org/docs/11/static/functions-formatting.html
      + 'TO_CHAR TO_DATE TO_NUMBER TO_TIMESTAMP '
      // https://www.postgresql.org/docs/11/static/functions-datetime.html
      + 'AGE CLOCK_TIMESTAMP|10 DATE_PART DATE_TRUNC ISFINITE JUSTIFY_DAYS JUSTIFY_HOURS JUSTIFY_INTERVAL '
      + 'MAKE_DATE MAKE_INTERVAL|10 MAKE_TIME MAKE_TIMESTAMP|10 MAKE_TIMESTAMPTZ|10 NOW STATEMENT_TIMESTAMP|10 '
      + 'TIMEOFDAY TRANSACTION_TIMESTAMP|10 '
      // https://www.postgresql.org/docs/11/static/functions-enum.html
      + 'ENUM_FIRST ENUM_LAST ENUM_RANGE '
      // https://www.postgresql.org/docs/11/static/functions-geometry.html
      + 'AREA CENTER DIAMETER HEIGHT ISCLOSED ISOPEN NPOINTS PCLOSE POPEN RADIUS WIDTH '
      + 'BOX BOUND_BOX CIRCLE LINE LSEG PATH POLYGON '
      // https://www.postgresql.org/docs/11/static/functions-net.html
      + 'ABBREV BROADCAST HOST HOSTMASK MASKLEN NETMASK NETWORK SET_MASKLEN TEXT INET_SAME_FAMILY '
      + 'INET_MERGE MACADDR8_SET7BIT '
      // https://www.postgresql.org/docs/11/static/functions-textsearch.html
      + 'ARRAY_TO_TSVECTOR GET_CURRENT_TS_CONFIG NUMNODE PLAINTO_TSQUERY PHRASETO_TSQUERY WEBSEARCH_TO_TSQUERY '
      + 'QUERYTREE SETWEIGHT STRIP TO_TSQUERY TO_TSVECTOR JSON_TO_TSVECTOR JSONB_TO_TSVECTOR TS_DELETE '
      + 'TS_FILTER TS_HEADLINE TS_RANK TS_RANK_CD TS_REWRITE TSQUERY_PHRASE TSVECTOR_TO_ARRAY '
      + 'TSVECTOR_UPDATE_TRIGGER TSVECTOR_UPDATE_TRIGGER_COLUMN '
      // https://www.postgresql.org/docs/11/static/functions-xml.html
      + 'XMLCOMMENT XMLCONCAT XMLELEMENT XMLFOREST XMLPI XMLROOT '
      + 'XMLEXISTS XML_IS_WELL_FORMED XML_IS_WELL_FORMED_DOCUMENT XML_IS_WELL_FORMED_CONTENT '
      + 'XPATH XPATH_EXISTS XMLTABLE XMLNAMESPACES '
      + 'TABLE_TO_XML TABLE_TO_XMLSCHEMA TABLE_TO_XML_AND_XMLSCHEMA '
      + 'QUERY_TO_XML QUERY_TO_XMLSCHEMA QUERY_TO_XML_AND_XMLSCHEMA '
      + 'CURSOR_TO_XML CURSOR_TO_XMLSCHEMA '
      + 'SCHEMA_TO_XML SCHEMA_TO_XMLSCHEMA SCHEMA_TO_XML_AND_XMLSCHEMA '
      + 'DATABASE_TO_XML DATABASE_TO_XMLSCHEMA DATABASE_TO_XML_AND_XMLSCHEMA '
      + 'XMLATTRIBUTES '
      // https://www.postgresql.org/docs/11/static/functions-json.html
      + 'TO_JSON TO_JSONB ARRAY_TO_JSON ROW_TO_JSON JSON_BUILD_ARRAY JSONB_BUILD_ARRAY JSON_BUILD_OBJECT '
      + 'JSONB_BUILD_OBJECT JSON_OBJECT JSONB_OBJECT JSON_ARRAY_LENGTH JSONB_ARRAY_LENGTH JSON_EACH '
      + 'JSONB_EACH JSON_EACH_TEXT JSONB_EACH_TEXT JSON_EXTRACT_PATH JSONB_EXTRACT_PATH '
      + 'JSON_OBJECT_KEYS JSONB_OBJECT_KEYS JSON_POPULATE_RECORD JSONB_POPULATE_RECORD JSON_POPULATE_RECORDSET '
      + 'JSONB_POPULATE_RECORDSET JSON_ARRAY_ELEMENTS JSONB_ARRAY_ELEMENTS JSON_ARRAY_ELEMENTS_TEXT '
      + 'JSONB_ARRAY_ELEMENTS_TEXT JSON_TYPEOF JSONB_TYPEOF JSON_TO_RECORD JSONB_TO_RECORD JSON_TO_RECORDSET '
      + 'JSONB_TO_RECORDSET JSON_STRIP_NULLS JSONB_STRIP_NULLS JSONB_SET JSONB_INSERT JSONB_PRETTY '
      // https://www.postgresql.org/docs/11/static/functions-sequence.html
      + 'CURRVAL LASTVAL NEXTVAL SETVAL '
      // https://www.postgresql.org/docs/11/static/functions-conditional.html
      + 'COALESCE NULLIF GREATEST LEAST '
      // https://www.postgresql.org/docs/11/static/functions-array.html
      + 'ARRAY_APPEND ARRAY_CAT ARRAY_NDIMS ARRAY_DIMS ARRAY_FILL ARRAY_LENGTH ARRAY_LOWER ARRAY_POSITION '
      + 'ARRAY_POSITIONS ARRAY_PREPEND ARRAY_REMOVE ARRAY_REPLACE ARRAY_TO_STRING ARRAY_UPPER CARDINALITY '
      + 'STRING_TO_ARRAY UNNEST '
      // https://www.postgresql.org/docs/11/static/functions-range.html
      + 'ISEMPTY LOWER_INC UPPER_INC LOWER_INF UPPER_INF RANGE_MERGE '
      // https://www.postgresql.org/docs/11/static/functions-srf.html
      + 'GENERATE_SERIES GENERATE_SUBSCRIPTS '
      // https://www.postgresql.org/docs/11/static/functions-info.html
      + 'CURRENT_DATABASE CURRENT_QUERY CURRENT_SCHEMA|10 CURRENT_SCHEMAS|10 INET_CLIENT_ADDR INET_CLIENT_PORT '
      + 'INET_SERVER_ADDR INET_SERVER_PORT ROW_SECURITY_ACTIVE FORMAT_TYPE '
      + 'TO_REGCLASS TO_REGPROC TO_REGPROCEDURE TO_REGOPER TO_REGOPERATOR TO_REGTYPE TO_REGNAMESPACE TO_REGROLE '
      + 'COL_DESCRIPTION OBJ_DESCRIPTION SHOBJ_DESCRIPTION '
      + 'TXID_CURRENT TXID_CURRENT_IF_ASSIGNED TXID_CURRENT_SNAPSHOT TXID_SNAPSHOT_XIP TXID_SNAPSHOT_XMAX '
      + 'TXID_SNAPSHOT_XMIN TXID_VISIBLE_IN_SNAPSHOT TXID_STATUS '
      // https://www.postgresql.org/docs/11/static/functions-admin.html
      + 'CURRENT_SETTING SET_CONFIG BRIN_SUMMARIZE_NEW_VALUES BRIN_SUMMARIZE_RANGE BRIN_DESUMMARIZE_RANGE '
      + 'GIN_CLEAN_PENDING_LIST '
      // https://www.postgresql.org/docs/11/static/functions-trigger.html
      + 'SUPPRESS_REDUNDANT_UPDATES_TRIGGER '
      // ihttps://www.postgresql.org/docs/devel/static/lo-funcs.html
      + 'LO_FROM_BYTEA LO_PUT LO_GET LO_CREAT LO_CREATE LO_UNLINK LO_IMPORT LO_EXPORT LOREAD LOWRITE '
      //
      + 'GROUPING CAST ';

    const FUNCTIONS_RE =
        FUNCTIONS.trim()
          .split(' ')
          .map(function(val) { return val.split('|')[0]; })
          .join('|');

    return {
      name: 'PostgreSQL',
      aliases: [
        'postgres',
        'postgresql'
      ],
      supersetOf: "sql",
      case_insensitive: true,
      keywords: {
        keyword:
              SQL_KW + PLPGSQL_KW + ROLE_ATTRS,
        built_in:
              SQL_BI + PLPGSQL_BI + PLPGSQL_EXCEPTIONS
      },
      // Forbid some cunstructs from other languages to improve autodetect. In fact
      // "[a-z]:" is legal (as part of array slice), but improbabal.
      illegal: /:==|\W\s*\(\*|(^|\s)\$[a-z]|\{\{|[a-z]:\s*$|\.\.\.|TO:|DO:/,
      contains: [
        // special handling of some words, which are reserved only in some contexts
        {
          className: 'keyword',
          variants: [
            { begin: /\bTEXT\s*SEARCH\b/ },
            { begin: /\b(PRIMARY|FOREIGN|FOR(\s+NO)?)\s+KEY\b/ },
            { begin: /\bPARALLEL\s+(UNSAFE|RESTRICTED|SAFE)\b/ },
            { begin: /\bSTORAGE\s+(PLAIN|EXTERNAL|EXTENDED|MAIN)\b/ },
            { begin: /\bMATCH\s+(FULL|PARTIAL|SIMPLE)\b/ },
            { begin: /\bNULLS\s+(FIRST|LAST)\b/ },
            { begin: /\bEVENT\s+TRIGGER\b/ },
            { begin: /\b(MAPPING|OR)\s+REPLACE\b/ },
            { begin: /\b(FROM|TO)\s+(PROGRAM|STDIN|STDOUT)\b/ },
            { begin: /\b(SHARE|EXCLUSIVE)\s+MODE\b/ },
            { begin: /\b(LEFT|RIGHT)\s+(OUTER\s+)?JOIN\b/ },
            { begin: /\b(FETCH|MOVE)\s+(NEXT|PRIOR|FIRST|LAST|ABSOLUTE|RELATIVE|FORWARD|BACKWARD)\b/ },
            { begin: /\bPRESERVE\s+ROWS\b/ },
            { begin: /\bDISCARD\s+PLANS\b/ },
            { begin: /\bREFERENCING\s+(OLD|NEW)\b/ },
            { begin: /\bSKIP\s+LOCKED\b/ },
            { begin: /\bGROUPING\s+SETS\b/ },
            { begin: /\b(BINARY|INSENSITIVE|SCROLL|NO\s+SCROLL)\s+(CURSOR|FOR)\b/ },
            { begin: /\b(WITH|WITHOUT)\s+HOLD\b/ },
            { begin: /\bWITH\s+(CASCADED|LOCAL)\s+CHECK\s+OPTION\b/ },
            { begin: /\bEXCLUDE\s+(TIES|NO\s+OTHERS)\b/ },
            { begin: /\bFORMAT\s+(TEXT|XML|JSON|YAML)\b/ },
            { begin: /\bSET\s+((SESSION|LOCAL)\s+)?NAMES\b/ },
            { begin: /\bIS\s+(NOT\s+)?UNKNOWN\b/ },
            { begin: /\bSECURITY\s+LABEL\b/ },
            { begin: /\bSTANDALONE\s+(YES|NO|NO\s+VALUE)\b/ },
            { begin: /\bWITH\s+(NO\s+)?DATA\b/ },
            { begin: /\b(FOREIGN|SET)\s+DATA\b/ },
            { begin: /\bSET\s+(CATALOG|CONSTRAINTS)\b/ },
            { begin: /\b(WITH|FOR)\s+ORDINALITY\b/ },
            { begin: /\bIS\s+(NOT\s+)?DOCUMENT\b/ },
            { begin: /\bXML\s+OPTION\s+(DOCUMENT|CONTENT)\b/ },
            { begin: /\b(STRIP|PRESERVE)\s+WHITESPACE\b/ },
            { begin: /\bNO\s+(ACTION|MAXVALUE|MINVALUE)\b/ },
            { begin: /\bPARTITION\s+BY\s+(RANGE|LIST|HASH)\b/ },
            { begin: /\bAT\s+TIME\s+ZONE\b/ },
            { begin: /\bGRANTED\s+BY\b/ },
            { begin: /\bRETURN\s+(QUERY|NEXT)\b/ },
            { begin: /\b(ATTACH|DETACH)\s+PARTITION\b/ },
            { begin: /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/ },
            { begin: /\b(INCLUDING|EXCLUDING)\s+(COMMENTS|CONSTRAINTS|DEFAULTS|IDENTITY|INDEXES|STATISTICS|STORAGE|ALL)\b/ },
            { begin: /\bAS\s+(ASSIGNMENT|IMPLICIT|PERMISSIVE|RESTRICTIVE|ENUM|RANGE)\b/ }
          ]
        },
        // functions named as keywords, followed by '('
        { begin: /\b(FORMAT|FAMILY|VERSION)\s*\(/
          // keywords: { built_in: 'FORMAT FAMILY VERSION' }
        },
        // INCLUDE ( ... ) in index_parameters in CREATE TABLE
        {
          begin: /\bINCLUDE\s*\(/,
          keywords: 'INCLUDE'
        },
        // not highlight RANGE if not in frame_clause (not 100% correct, but seems satisfactory)
        { begin: /\bRANGE(?!\s*(BETWEEN|UNBOUNDED|CURRENT|[-0-9]+))/ },
        // disable highlighting in commands CREATE AGGREGATE/COLLATION/DATABASE/OPERTOR/TEXT SEARCH .../TYPE
        // and in PL/pgSQL RAISE ... USING
        { begin: /\b(VERSION|OWNER|TEMPLATE|TABLESPACE|CONNECTION\s+LIMIT|PROCEDURE|RESTRICT|JOIN|PARSER|COPY|START|END|COLLATION|INPUT|ANALYZE|STORAGE|LIKE|DEFAULT|DELIMITER|ENCODING|COLUMN|CONSTRAINT|TABLE|SCHEMA)\s*=/ },
        // PG_smth; HAS_some_PRIVILEGE
        {
          // className: 'built_in',
          begin: /\b(PG_\w+?|HAS_[A-Z_]+_PRIVILEGE)\b/,
          relevance: 10
        },
        // extract
        {
          begin: /\bEXTRACT\s*\(/,
          end: /\bFROM\b/,
          returnEnd: true,
          keywords: {
            // built_in: 'EXTRACT',
            type: 'CENTURY DAY DECADE DOW DOY EPOCH HOUR ISODOW ISOYEAR MICROSECONDS '
                          + 'MILLENNIUM MILLISECONDS MINUTE MONTH QUARTER SECOND TIMEZONE TIMEZONE_HOUR '
                          + 'TIMEZONE_MINUTE WEEK YEAR' }
        },
        // xmlelement, xmlpi - special NAME
        {
          begin: /\b(XMLELEMENT|XMLPI)\s*\(\s*NAME/,
          keywords: {
            // built_in: 'XMLELEMENT XMLPI',
            keyword: 'NAME' }
        },
        // xmlparse, xmlserialize
        {
          begin: /\b(XMLPARSE|XMLSERIALIZE)\s*\(\s*(DOCUMENT|CONTENT)/,
          keywords: {
            // built_in: 'XMLPARSE XMLSERIALIZE',
            keyword: 'DOCUMENT CONTENT' }
        },
        // Sequences. We actually skip everything between CACHE|INCREMENT|MAXVALUE|MINVALUE and
        // nearest following numeric constant. Without with trick we find a lot of "keywords"
        // in 'avrasm' autodetection test...
        {
          beginKeywords: 'CACHE INCREMENT MAXVALUE MINVALUE',
          end: hljs.C_NUMBER_RE,
          returnEnd: true,
          keywords: 'BY CACHE INCREMENT MAXVALUE MINVALUE'
        },
        // WITH|WITHOUT TIME ZONE as part of datatype
        {
          className: 'type',
          begin: /\b(WITH|WITHOUT)\s+TIME\s+ZONE\b/
        },
        // INTERVAL optional fields
        {
          className: 'type',
          begin: /\bINTERVAL\s+(YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)(\s+TO\s+(MONTH|HOUR|MINUTE|SECOND))?\b/
        },
        // Pseudo-types which allowed only as return type
        {
          begin: /\bRETURNS\s+(LANGUAGE_HANDLER|TRIGGER|EVENT_TRIGGER|FDW_HANDLER|INDEX_AM_HANDLER|TSM_HANDLER)\b/,
          keywords: {
            keyword: 'RETURNS',
            type: 'LANGUAGE_HANDLER TRIGGER EVENT_TRIGGER FDW_HANDLER INDEX_AM_HANDLER TSM_HANDLER'
          }
        },
        // Known functions - only when followed by '('
        { begin: '\\b(' + FUNCTIONS_RE + ')\\s*\\('
          // keywords: { built_in: FUNCTIONS }
        },
        // Types
        { begin: '\\.(' + TYPES_RE + ')\\b' // prevent highlight as type, say, 'oid' in 'pgclass.oid'
        },
        {
          begin: '\\b(' + TYPES_RE + ')\\s+PATH\\b', // in XMLTABLE
          keywords: {
            keyword: 'PATH', // hopefully no one would use PATH type in XMLTABLE...
            type: TYPES.replace('PATH ', '')
          }
        },
        {
          className: 'type',
          begin: '\\b(' + TYPES_RE + ')\\b'
        },
        // Strings, see https://www.postgresql.org/docs/11/static/sql-syntax-lexical.html#SQL-SYNTAX-CONSTANTS
        {
          className: 'string',
          begin: '\'',
          end: '\'',
          contains: [ { begin: '\'\'' } ]
        },
        {
          className: 'string',
          begin: '(e|E|u&|U&)\'',
          end: '\'',
          contains: [ { begin: '\\\\.' } ],
          relevance: 10
        },
        hljs.END_SAME_AS_BEGIN({
          begin: DOLLAR_STRING,
          end: DOLLAR_STRING,
          contains: [
            {
              // actually we want them all except SQL; listed are those with known implementations
              // and XML + JSON just in case
              subLanguage: [
                'pgsql',
                'perl',
                'python',
                'tcl',
                'r',
                'lua',
                'java',
                'php',
                'ruby',
                'bash',
                'scheme',
                'xml',
                'json'
              ],
              endsWithParent: true
            }
          ]
        }),
        // identifiers in quotes
        {
          begin: '"',
          end: '"',
          contains: [ { begin: '""' } ]
        },
        // numbers
        hljs.C_NUMBER_MODE,
        // comments
        hljs.C_BLOCK_COMMENT_MODE,
        COMMENT_MODE,
        // PL/pgSQL staff
        // %ROWTYPE, %TYPE, $n
        {
          className: 'meta',
          variants: [
            { // %TYPE, %ROWTYPE
              begin: '%(ROW)?TYPE',
              relevance: 10
            },
            { // $n
              begin: '\\$\\d+' },
            { // #compiler option
              begin: '^#\\w',
              end: '$'
            }
          ]
        },
        // <<labeles>>
        {
          className: 'symbol',
          begin: LABEL,
          relevance: 10
        }
      ]
    };
  }

  return pgsql;

})();

    hljs.registerLanguage('pgsql', hljsGrammar);
  })();/*! `php` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PHP
  Author: Victor Karamzin <Victor.Karamzin@enterra-inc.com>
  Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Ivan Sagalaev <maniac@softwaremaniacs.org>
  Website: https://www.php.net
  Category: common
  */

  /**
   * @param {HLJSApi} hljs
   * @returns {LanguageDetail}
   * */
  function php(hljs) {
    const regex = hljs.regex;
    // negative look-ahead tries to avoid matching patterns that are not
    // Perl at all like $ident$, @ident@, etc.
    const NOT_PERL_ETC = /(?![A-Za-z0-9])(?![$])/;
    const IDENT_RE = regex.concat(
      /[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/,
      NOT_PERL_ETC);
    // Will not detect camelCase classes
    const PASCAL_CASE_CLASS_NAME_RE = regex.concat(
      /(\\?[A-Z][a-z0-9_\x7f-\xff]+|\\?[A-Z]+(?=[A-Z][a-z0-9_\x7f-\xff])){1,}/,
      NOT_PERL_ETC);
    const VARIABLE = {
      scope: 'variable',
      match: '\\$+' + IDENT_RE,
    };
    const PREPROCESSOR = {
      scope: 'meta',
      variants: [
        { begin: /<\?php/, relevance: 10 }, // boost for obvious PHP
        { begin: /<\?=/ },
        // less relevant per PSR-1 which says not to use short-tags
        { begin: /<\?/, relevance: 0.1 },
        { begin: /\?>/ } // end php tag
      ]
    };
    const SUBST = {
      scope: 'subst',
      variants: [
        { begin: /\$\w+/ },
        {
          begin: /\{\$/,
          end: /\}/
        }
      ]
    };
    const SINGLE_QUOTED = hljs.inherit(hljs.APOS_STRING_MODE, { illegal: null, });
    const DOUBLE_QUOTED = hljs.inherit(hljs.QUOTE_STRING_MODE, {
      illegal: null,
      contains: hljs.QUOTE_STRING_MODE.contains.concat(SUBST),
    });

    const HEREDOC = {
      begin: /<<<[ \t]*(?:(\w+)|"(\w+)")\n/,
      end: /[ \t]*(\w+)\b/,
      contains: hljs.QUOTE_STRING_MODE.contains.concat(SUBST),
      'on:begin': (m, resp) => { resp.data._beginMatch = m[1] || m[2]; },
      'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); },
    };

    const NOWDOC = hljs.END_SAME_AS_BEGIN({
      begin: /<<<[ \t]*'(\w+)'\n/,
      end: /[ \t]*(\w+)\b/,
    });
    // list of valid whitespaces because non-breaking space might be part of a IDENT_RE
    const WHITESPACE = '[ \t\n]';
    const STRING = {
      scope: 'string',
      variants: [
        DOUBLE_QUOTED,
        SINGLE_QUOTED,
        HEREDOC,
        NOWDOC
      ]
    };
    const NUMBER = {
      scope: 'number',
      variants: [
        { begin: `\\b0[bB][01]+(?:_[01]+)*\\b` }, // Binary w/ underscore support
        { begin: `\\b0[oO][0-7]+(?:_[0-7]+)*\\b` }, // Octals w/ underscore support
        { begin: `\\b0[xX][\\da-fA-F]+(?:_[\\da-fA-F]+)*\\b` }, // Hex w/ underscore support
        // Decimals w/ underscore support, with optional fragments and scientific exponent (e) suffix.
        { begin: `(?:\\b\\d+(?:_\\d+)*(\\.(?:\\d+(?:_\\d+)*))?|\\B\\.\\d+)(?:[eE][+-]?\\d+)?` }
      ],
      relevance: 0
    };
    const LITERALS = [
      "false",
      "null",
      "true"
    ];
    const KWS = [
      // Magic constants:
      // <https://www.php.net/manual/en/language.constants.predefined.php>
      "__CLASS__",
      "__DIR__",
      "__FILE__",
      "__FUNCTION__",
      "__COMPILER_HALT_OFFSET__",
      "__LINE__",
      "__METHOD__",
      "__NAMESPACE__",
      "__TRAIT__",
      // Function that look like language construct or language construct that look like function:
      // List of keywords that may not require parenthesis
      "die",
      "echo",
      "exit",
      "include",
      "include_once",
      "print",
      "require",
      "require_once",
      // These are not language construct (function) but operate on the currently-executing function and can access the current symbol table
      // 'compact extract func_get_arg func_get_args func_num_args get_called_class get_parent_class ' +
      // Other keywords:
      // <https://www.php.net/manual/en/reserved.php>
      // <https://www.php.net/manual/en/language.types.type-juggling.php>
      "array",
      "abstract",
      "and",
      "as",
      "binary",
      "bool",
      "boolean",
      "break",
      "callable",
      "case",
      "catch",
      "class",
      "clone",
      "const",
      "continue",
      "declare",
      "default",
      "do",
      "double",
      "else",
      "elseif",
      "empty",
      "enddeclare",
      "endfor",
      "endforeach",
      "endif",
      "endswitch",
      "endwhile",
      "enum",
      "eval",
      "extends",
      "final",
      "finally",
      "float",
      "for",
      "foreach",
      "from",
      "global",
      "goto",
      "if",
      "implements",
      "instanceof",
      "insteadof",
      "int",
      "integer",
      "interface",
      "isset",
      "iterable",
      "list",
      "match|0",
      "mixed",
      "new",
      "never",
      "object",
      "or",
      "private",
      "protected",
      "public",
      "readonly",
      "real",
      "return",
      "string",
      "switch",
      "throw",
      "trait",
      "try",
      "unset",
      "use",
      "var",
      "void",
      "while",
      "xor",
      "yield"
    ];

    const BUILT_INS = [
      // Standard PHP library:
      // <https://www.php.net/manual/en/book.spl.php>
      "Error|0",
      "AppendIterator",
      "ArgumentCountError",
      "ArithmeticError",
      "ArrayIterator",
      "ArrayObject",
      "AssertionError",
      "BadFunctionCallException",
      "BadMethodCallException",
      "CachingIterator",
      "CallbackFilterIterator",
      "CompileError",
      "Countable",
      "DirectoryIterator",
      "DivisionByZeroError",
      "DomainException",
      "EmptyIterator",
      "ErrorException",
      "Exception",
      "FilesystemIterator",
      "FilterIterator",
      "GlobIterator",
      "InfiniteIterator",
      "InvalidArgumentException",
      "IteratorIterator",
      "LengthException",
      "LimitIterator",
      "LogicException",
      "MultipleIterator",
      "NoRewindIterator",
      "OutOfBoundsException",
      "OutOfRangeException",
      "OuterIterator",
      "OverflowException",
      "ParentIterator",
      "ParseError",
      "RangeException",
      "RecursiveArrayIterator",
      "RecursiveCachingIterator",
      "RecursiveCallbackFilterIterator",
      "RecursiveDirectoryIterator",
      "RecursiveFilterIterator",
      "RecursiveIterator",
      "RecursiveIteratorIterator",
      "RecursiveRegexIterator",
      "RecursiveTreeIterator",
      "RegexIterator",
      "RuntimeException",
      "SeekableIterator",
      "SplDoublyLinkedList",
      "SplFileInfo",
      "SplFileObject",
      "SplFixedArray",
      "SplHeap",
      "SplMaxHeap",
      "SplMinHeap",
      "SplObjectStorage",
      "SplObserver",
      "SplPriorityQueue",
      "SplQueue",
      "SplStack",
      "SplSubject",
      "SplTempFileObject",
      "TypeError",
      "UnderflowException",
      "UnexpectedValueException",
      "UnhandledMatchError",
      // Reserved interfaces:
      // <https://www.php.net/manual/en/reserved.interfaces.php>
      "ArrayAccess",
      "BackedEnum",
      "Closure",
      "Fiber",
      "Generator",
      "Iterator",
      "IteratorAggregate",
      "Serializable",
      "Stringable",
      "Throwable",
      "Traversable",
      "UnitEnum",
      "WeakReference",
      "WeakMap",
      // Reserved classes:
      // <https://www.php.net/manual/en/reserved.classes.php>
      "Directory",
      "__PHP_Incomplete_Class",
      "parent",
      "php_user_filter",
      "self",
      "static",
      "stdClass"
    ];

    /** Dual-case keywords
     *
     * ["then","FILE"] =>
     *     ["then", "THEN", "FILE", "file"]
     *
     * @param {string[]} items */
    const dualCase = (items) => {
      /** @type string[] */
      const result = [];
      items.forEach(item => {
        result.push(item);
        if (item.toLowerCase() === item) {
          result.push(item.toUpperCase());
        } else {
          result.push(item.toLowerCase());
        }
      });
      return result;
    };

    const KEYWORDS = {
      keyword: KWS,
      literal: dualCase(LITERALS),
      built_in: BUILT_INS,
    };

    /**
     * @param {string[]} items */
    const normalizeKeywords = (items) => {
      return items.map(item => {
        return item.replace(/\|\d+$/, "");
      });
    };

    const CONSTRUCTOR_CALL = { variants: [
      {
        match: [
          /new/,
          regex.concat(WHITESPACE, "+"),
          // to prevent built ins from being confused as the class constructor call
          regex.concat("(?!", normalizeKeywords(BUILT_INS).join("\\b|"), "\\b)"),
          PASCAL_CASE_CLASS_NAME_RE,
        ],
        scope: {
          1: "keyword",
          4: "title.class",
        },
      }
    ] };

    const CONSTANT_REFERENCE = regex.concat(IDENT_RE, "\\b(?!\\()");

    const LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON = { variants: [
      {
        match: [
          regex.concat(
            /::/,
            regex.lookahead(/(?!class\b)/)
          ),
          CONSTANT_REFERENCE,
        ],
        scope: { 2: "variable.constant", },
      },
      {
        match: [
          /::/,
          /class/,
        ],
        scope: { 2: "variable.language", },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          regex.concat(
            /::/,
            regex.lookahead(/(?!class\b)/)
          ),
          CONSTANT_REFERENCE,
        ],
        scope: {
          1: "title.class",
          3: "variable.constant",
        },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          regex.concat(
            "::",
            regex.lookahead(/(?!class\b)/)
          ),
        ],
        scope: { 1: "title.class", },
      },
      {
        match: [
          PASCAL_CASE_CLASS_NAME_RE,
          /::/,
          /class/,
        ],
        scope: {
          1: "title.class",
          3: "variable.language",
        },
      }
    ] };

    const NAMED_ARGUMENT = {
      scope: 'attr',
      match: regex.concat(IDENT_RE, regex.lookahead(':'), regex.lookahead(/(?!::)/)),
    };
    const PARAMS_MODE = {
      relevance: 0,
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS,
      contains: [
        NAMED_ARGUMENT,
        VARIABLE,
        LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
        hljs.C_BLOCK_COMMENT_MODE,
        STRING,
        NUMBER,
        CONSTRUCTOR_CALL,
      ],
    };
    const FUNCTION_INVOKE = {
      relevance: 0,
      match: [
        /\b/,
        // to prevent keywords from being confused as the function title
        regex.concat("(?!fn\\b|function\\b|", normalizeKeywords(KWS).join("\\b|"), "|", normalizeKeywords(BUILT_INS).join("\\b|"), "\\b)"),
        IDENT_RE,
        regex.concat(WHITESPACE, "*"),
        regex.lookahead(/(?=\()/)
      ],
      scope: { 3: "title.function.invoke", },
      contains: [ PARAMS_MODE ]
    };
    PARAMS_MODE.contains.push(FUNCTION_INVOKE);

    const ATTRIBUTE_CONTAINS = [
      NAMED_ARGUMENT,
      LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING,
      NUMBER,
      CONSTRUCTOR_CALL,
    ];

    const ATTRIBUTES = {
      begin: regex.concat(/#\[\s*/, PASCAL_CASE_CLASS_NAME_RE),
      beginScope: "meta",
      end: /]/,
      endScope: "meta",
      keywords: {
        literal: LITERALS,
        keyword: [
          'new',
          'array',
        ]
      },
      contains: [
        {
          begin: /\[/,
          end: /]/,
          keywords: {
            literal: LITERALS,
            keyword: [
              'new',
              'array',
            ]
          },
          contains: [
            'self',
            ...ATTRIBUTE_CONTAINS,
          ]
        },
        ...ATTRIBUTE_CONTAINS,
        {
          scope: 'meta',
          match: PASCAL_CASE_CLASS_NAME_RE
        }
      ]
    };

    return {
      case_insensitive: false,
      keywords: KEYWORDS,
      contains: [
        ATTRIBUTES,
        hljs.HASH_COMMENT_MODE,
        hljs.COMMENT('//', '$'),
        hljs.COMMENT(
          '/\\*',
          '\\*/',
          { contains: [
            {
              scope: 'doctag',
              match: '@[A-Za-z]+'
            }
          ] }
        ),
        {
          match: /__halt_compiler\(\);/,
          keywords: '__halt_compiler',
          starts: {
            scope: "comment",
            end: hljs.MATCH_NOTHING_RE,
            contains: [
              {
                match: /\?>/,
                scope: "meta",
                endsParent: true
              }
            ]
          }
        },
        PREPROCESSOR,
        {
          scope: 'variable.language',
          match: /\$this\b/
        },
        VARIABLE,
        FUNCTION_INVOKE,
        LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
        {
          match: [
            /const/,
            /\s/,
            IDENT_RE,
          ],
          scope: {
            1: "keyword",
            3: "variable.constant",
          },
        },
        CONSTRUCTOR_CALL,
        {
          scope: 'function',
          relevance: 0,
          beginKeywords: 'fn function',
          end: /[;{]/,
          excludeEnd: true,
          illegal: '[$%\\[]',
          contains: [
            { beginKeywords: 'use', },
            hljs.UNDERSCORE_TITLE_MODE,
            {
              begin: '=>', // No markup, just a relevance booster
              endsParent: true
            },
            {
              scope: 'params',
              begin: '\\(',
              end: '\\)',
              excludeBegin: true,
              excludeEnd: true,
              keywords: KEYWORDS,
              contains: [
                'self',
                VARIABLE,
                LEFT_AND_RIGHT_SIDE_OF_DOUBLE_COLON,
                hljs.C_BLOCK_COMMENT_MODE,
                STRING,
                NUMBER
              ]
            },
          ]
        },
        {
          scope: 'class',
          variants: [
            {
              beginKeywords: "enum",
              illegal: /[($"]/
            },
            {
              beginKeywords: "class interface trait",
              illegal: /[:($"]/
            }
          ],
          relevance: 0,
          end: /\{/,
          excludeEnd: true,
          contains: [
            { beginKeywords: 'extends implements' },
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        // both use and namespace still use "old style" rules (vs multi-match)
        // because the namespace name can include `\` and we still want each
        // element to be treated as its own *individual* title
        {
          beginKeywords: 'namespace',
          relevance: 0,
          end: ';',
          illegal: /[.']/,
          contains: [ hljs.inherit(hljs.UNDERSCORE_TITLE_MODE, { scope: "title.class" }) ]
        },
        {
          beginKeywords: 'use',
          relevance: 0,
          end: ';',
          contains: [
            // TODO: title.function vs title.class
            {
              match: /\b(as|const|function)\b/,
              scope: "keyword"
            },
            // TODO: could be title.class or title.function
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        STRING,
        NUMBER,
      ]
    };
  }

  return php;

})();

    hljs.registerLanguage('php', hljsGrammar);
  })();/*! `php-template` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: PHP Template
  Requires: xml.js, php.js
  Author: Josh Goebel <hello@joshgoebel.com>
  Website: https://www.php.net
  Category: common
  */

  function phpTemplate(hljs) {
    return {
      name: "PHP template",
      subLanguage: 'xml',
      contains: [
        {
          begin: /<\?(php|=)?/,
          end: /\?>/,
          subLanguage: 'php',
          contains: [
            // We don't want the php closing tag ?> to close the PHP block when
            // inside any of the following blocks:
            {
              begin: '/\\*',
              end: '\\*/',
              skip: true
            },
            {
              begin: 'b"',
              end: '"',
              skip: true
            },
            {
              begin: 'b\'',
              end: '\'',
              skip: true
            },
            hljs.inherit(hljs.APOS_STRING_MODE, {
              illegal: null,
              className: null,
              contains: null,
              skip: true
            }),
            hljs.inherit(hljs.QUOTE_STRING_MODE, {
              illegal: null,
              className: null,
              contains: null,
              skip: true
            })
          ]
        }
      ]
    };
  }

  return phpTemplate;

})();

    hljs.registerLanguage('php-template', hljsGrammar);
  })();/*! `python` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Python
  Description: Python is an interpreted, object-oriented, high-level programming language with dynamic semantics.
  Website: https://www.python.org
  Category: common
  */

  function python(hljs) {
    const regex = hljs.regex;
    const IDENT_RE = /[\p{XID_Start}_]\p{XID_Continue}*/u;
    const RESERVED_WORDS = [
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'case',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'finally',
      'for',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'match',
      'nonlocal|10',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'try',
      'while',
      'with',
      'yield'
    ];

    const BUILT_INS = [
      '__import__',
      'abs',
      'all',
      'any',
      'ascii',
      'bin',
      'bool',
      'breakpoint',
      'bytearray',
      'bytes',
      'callable',
      'chr',
      'classmethod',
      'compile',
      'complex',
      'delattr',
      'dict',
      'dir',
      'divmod',
      'enumerate',
      'eval',
      'exec',
      'filter',
      'float',
      'format',
      'frozenset',
      'getattr',
      'globals',
      'hasattr',
      'hash',
      'help',
      'hex',
      'id',
      'input',
      'int',
      'isinstance',
      'issubclass',
      'iter',
      'len',
      'list',
      'locals',
      'map',
      'max',
      'memoryview',
      'min',
      'next',
      'object',
      'oct',
      'open',
      'ord',
      'pow',
      'print',
      'property',
      'range',
      'repr',
      'reversed',
      'round',
      'set',
      'setattr',
      'slice',
      'sorted',
      'staticmethod',
      'str',
      'sum',
      'super',
      'tuple',
      'type',
      'vars',
      'zip'
    ];

    const LITERALS = [
      '__debug__',
      'Ellipsis',
      'False',
      'None',
      'NotImplemented',
      'True'
    ];

    // https://docs.python.org/3/library/typing.html
    // TODO: Could these be supplemented by a CamelCase matcher in certain
    // contexts, leaving these remaining only for relevance hinting?
    const TYPES = [
      "Any",
      "Callable",
      "Coroutine",
      "Dict",
      "List",
      "Literal",
      "Generic",
      "Optional",
      "Sequence",
      "Set",
      "Tuple",
      "Type",
      "Union"
    ];

    const KEYWORDS = {
      $pattern: /[A-Za-z]\w+|__\w+__/,
      keyword: RESERVED_WORDS,
      built_in: BUILT_INS,
      literal: LITERALS,
      type: TYPES
    };

    const PROMPT = {
      className: 'meta',
      begin: /^(>>>|\.\.\.) /
    };

    const SUBST = {
      className: 'subst',
      begin: /\{/,
      end: /\}/,
      keywords: KEYWORDS,
      illegal: /#/
    };

    const LITERAL_BRACKET = {
      begin: /\{\{/,
      relevance: 0
    };

    const STRING = {
      className: 'string',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/,
          end: /'''/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT
          ],
          relevance: 10
        },
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/,
          end: /"""/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT
          ],
          relevance: 10
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'''/,
          end: /'''/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"""/,
          end: /"""/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            PROMPT,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([uU]|[rR])'/,
          end: /'/,
          relevance: 10
        },
        {
          begin: /([uU]|[rR])"/,
          end: /"/,
          relevance: 10
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])'/,
          end: /'/
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])"/,
          end: /"/
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'/,
          end: /'/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"/,
          end: /"/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            LITERAL_BRACKET,
            SUBST
          ]
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE
      ]
    };

    // https://docs.python.org/3.9/reference/lexical_analysis.html#numeric-literals
    const digitpart = '[0-9](_?[0-9])*';
    const pointfloat = `(\\b(${digitpart}))?\\.(${digitpart})|\\b(${digitpart})\\.`;
    // Whitespace after a number (or any lexical token) is needed only if its absence
    // would change the tokenization
    // https://docs.python.org/3.9/reference/lexical_analysis.html#whitespace-between-tokens
    // We deviate slightly, requiring a word boundary or a keyword
    // to avoid accidentally recognizing *prefixes* (e.g., `0` in `0x41` or `08` or `0__1`)
    const lookahead = `\\b|${RESERVED_WORDS.join('|')}`;
    const NUMBER = {
      className: 'number',
      relevance: 0,
      variants: [
        // exponentfloat, pointfloat
        // https://docs.python.org/3.9/reference/lexical_analysis.html#floating-point-literals
        // optionally imaginary
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        // Note: no leading \b because floats can start with a decimal point
        // and we don't want to mishandle e.g. `fn(.5)`,
        // no trailing \b for pointfloat because it can end with a decimal point
        // and we don't want to mishandle e.g. `0..hex()`; this should be safe
        // because both MUST contain a decimal point and so cannot be confused with
        // the interior part of an identifier
        {
          begin: `(\\b(${digitpart})|(${pointfloat}))[eE][+-]?(${digitpart})[jJ]?(?=${lookahead})`
        },
        {
          begin: `(${pointfloat})[jJ]?`
        },

        // decinteger, bininteger, octinteger, hexinteger
        // https://docs.python.org/3.9/reference/lexical_analysis.html#integer-literals
        // optionally "long" in Python 2
        // https://docs.python.org/2.7/reference/lexical_analysis.html#integer-and-long-integer-literals
        // decinteger is optionally imaginary
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        {
          begin: `\\b([1-9](_?[0-9])*|0+(_?0)*)[lLjJ]?(?=${lookahead})`
        },
        {
          begin: `\\b0[bB](_?[01])+[lL]?(?=${lookahead})`
        },
        {
          begin: `\\b0[oO](_?[0-7])+[lL]?(?=${lookahead})`
        },
        {
          begin: `\\b0[xX](_?[0-9a-fA-F])+[lL]?(?=${lookahead})`
        },

        // imagnumber (digitpart-based)
        // https://docs.python.org/3.9/reference/lexical_analysis.html#imaginary-literals
        {
          begin: `\\b(${digitpart})[jJ](?=${lookahead})`
        }
      ]
    };
    const COMMENT_TYPE = {
      className: "comment",
      begin: regex.lookahead(/# type:/),
      end: /$/,
      keywords: KEYWORDS,
      contains: [
        { // prevent keywords from coloring `type`
          begin: /# type:/
        },
        // comment within a datatype comment includes no keywords
        {
          begin: /#/,
          end: /\b\B/,
          endsWithParent: true
        }
      ]
    };
    const PARAMS = {
      className: 'params',
      variants: [
        // Exclude params in functions without params
        {
          className: "",
          begin: /\(\s*\)/,
          skip: true
        },
        {
          begin: /\(/,
          end: /\)/,
          excludeBegin: true,
          excludeEnd: true,
          keywords: KEYWORDS,
          contains: [
            'self',
            PROMPT,
            NUMBER,
            STRING,
            hljs.HASH_COMMENT_MODE
          ]
        }
      ]
    };
    SUBST.contains = [
      STRING,
      NUMBER,
      PROMPT
    ];

    return {
      name: 'Python',
      aliases: [
        'py',
        'gyp',
        'ipython'
      ],
      unicodeRegex: true,
      keywords: KEYWORDS,
      illegal: /(<\/|\?)|=>/,
      contains: [
        PROMPT,
        NUMBER,
        {
          // very common convention
          begin: /\bself\b/
        },
        {
          // eat "if" prior to string so that it won't accidentally be
          // labeled as an f-string
          beginKeywords: "if",
          relevance: 0
        },
        { match: /\bor\b/, scope: "keyword" },
        STRING,
        COMMENT_TYPE,
        hljs.HASH_COMMENT_MODE,
        {
          match: [
            /\bdef/, /\s+/,
            IDENT_RE,
          ],
          scope: {
            1: "keyword",
            3: "title.function"
          },
          contains: [ PARAMS ]
        },
        {
          variants: [
            {
              match: [
                /\bclass/, /\s+/,
                IDENT_RE, /\s*/,
                /\(\s*/, IDENT_RE,/\s*\)/
              ],
            },
            {
              match: [
                /\bclass/, /\s+/,
                IDENT_RE
              ],
            }
          ],
          scope: {
            1: "keyword",
            3: "title.class",
            6: "title.class.inherited",
          }
        },
        {
          className: 'meta',
          begin: /^[\t ]*@/,
          end: /(?=#)|$/,
          contains: [
            NUMBER,
            PARAMS,
            STRING
          ]
        }
      ]
    };
  }

  return python;

})();

    hljs.registerLanguage('python', hljsGrammar);
  })();/*! `python-repl` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Python REPL
  Requires: python.js
  Author: Josh Goebel <hello@joshgoebel.com>
  Category: common
  */

  function pythonRepl(hljs) {
    return {
      aliases: [ 'pycon' ],
      contains: [
        {
          className: 'meta.prompt',
          starts: {
            // a space separates the REPL prefix from the actual code
            // this is purely for cleaner HTML output
            end: / |$/,
            starts: {
              end: '$',
              subLanguage: 'python'
            }
          },
          variants: [
            { begin: /^>>>(?=[ ]|$)/ },
            { begin: /^\.\.\.(?=[ ]|$)/ }
          ]
        }
      ]
    };
  }

  return pythonRepl;

})();

    hljs.registerLanguage('python-repl', hljsGrammar);
  })();/*! `r` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: R
  Description: R is a free software environment for statistical computing and graphics.
  Author: Joe Cheng <joe@rstudio.org>
  Contributors: Konrad Rudolph <konrad.rudolph@gmail.com>
  Website: https://www.r-project.org
  Category: common,scientific
  */

  /** @type LanguageFn */
  function r(hljs) {
    const regex = hljs.regex;
    // Identifiers in R cannot start with `_`, but they can start with `.` if it
    // is not immediately followed by a digit.
    // R also supports quoted identifiers, which are near-arbitrary sequences
    // delimited by backticks (`…`), which may contain escape sequences. These are
    // handled in a separate mode. See `test/markup/r/names.txt` for examples.
    // FIXME: Support Unicode identifiers.
    const IDENT_RE = /(?:(?:[a-zA-Z]|\.[._a-zA-Z])[._a-zA-Z0-9]*)|\.(?!\d)/;
    const NUMBER_TYPES_RE = regex.either(
      // Special case: only hexadecimal binary powers can contain fractions
      /0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*[pP][+-]?\d+i?/,
      // Hexadecimal numbers without fraction and optional binary power
      /0[xX][0-9a-fA-F]+(?:[pP][+-]?\d+)?[Li]?/,
      // Decimal numbers
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[Li]?/
    );
    const OPERATORS_RE = /[=!<>:]=|\|\||&&|:::?|<-|<<-|->>|->|\|>|[-+*\/?!$&|:<=>@^~]|\*\*/;
    const PUNCTUATION_RE = regex.either(
      /[()]/,
      /[{}]/,
      /\[\[/,
      /[[\]]/,
      /\\/,
      /,/
    );

    return {
      name: 'R',

      keywords: {
        $pattern: IDENT_RE,
        keyword:
          'function if in break next repeat else for while',
        literal:
          'NULL NA TRUE FALSE Inf NaN NA_integer_|10 NA_real_|10 '
          + 'NA_character_|10 NA_complex_|10',
        built_in:
          // Builtin constants
          'LETTERS letters month.abb month.name pi T F '
          // Primitive functions
          // These are all the functions in `base` that are implemented as a
          // `.Primitive`, minus those functions that are also keywords.
          + 'abs acos acosh all any anyNA Arg as.call as.character '
          + 'as.complex as.double as.environment as.integer as.logical '
          + 'as.null.default as.numeric as.raw asin asinh atan atanh attr '
          + 'attributes baseenv browser c call ceiling class Conj cos cosh '
          + 'cospi cummax cummin cumprod cumsum digamma dim dimnames '
          + 'emptyenv exp expression floor forceAndCall gamma gc.time '
          + 'globalenv Im interactive invisible is.array is.atomic is.call '
          + 'is.character is.complex is.double is.environment is.expression '
          + 'is.finite is.function is.infinite is.integer is.language '
          + 'is.list is.logical is.matrix is.na is.name is.nan is.null '
          + 'is.numeric is.object is.pairlist is.raw is.recursive is.single '
          + 'is.symbol lazyLoadDBfetch length lgamma list log max min '
          + 'missing Mod names nargs nzchar oldClass on.exit pos.to.env '
          + 'proc.time prod quote range Re rep retracemem return round '
          + 'seq_along seq_len seq.int sign signif sin sinh sinpi sqrt '
          + 'standardGeneric substitute sum switch tan tanh tanpi tracemem '
          + 'trigamma trunc unclass untracemem UseMethod xtfrm',
      },

      contains: [
        // Roxygen comments
        hljs.COMMENT(
          /#'/,
          /$/,
          { contains: [
            {
              // Handle `@examples` separately to cause all subsequent code
              // until the next `@`-tag on its own line to be kept as-is,
              // preventing highlighting. This code is example R code, so nested
              // doctags shouldn’t be treated as such. See
              // `test/markup/r/roxygen.txt` for an example.
              scope: 'doctag',
              match: /@examples/,
              starts: {
                end: regex.lookahead(regex.either(
                  // end if another doc comment
                  /\n^#'\s*(?=@[a-zA-Z]+)/,
                  // or a line with no comment
                  /\n^(?!#')/
                )),
                endsParent: true
              }
            },
            {
              // Handle `@param` to highlight the parameter name following
              // after.
              scope: 'doctag',
              begin: '@param',
              end: /$/,
              contains: [
                {
                  scope: 'variable',
                  variants: [
                    { match: IDENT_RE },
                    { match: /`(?:\\.|[^`\\])+`/ }
                  ],
                  endsParent: true
                }
              ]
            },
            {
              scope: 'doctag',
              match: /@[a-zA-Z]+/
            },
            {
              scope: 'keyword',
              match: /\\[a-zA-Z]+/
            }
          ] }
        ),

        hljs.HASH_COMMENT_MODE,

        {
          scope: 'string',
          contains: [ hljs.BACKSLASH_ESCAPE ],
          variants: [
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\(/,
              end: /\)(-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\{/,
              end: /\}(-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]"(-*)\[/,
              end: /\](-*)"/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\(/,
              end: /\)(-*)'/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\{/,
              end: /\}(-*)'/
            }),
            hljs.END_SAME_AS_BEGIN({
              begin: /[rR]'(-*)\[/,
              end: /\](-*)'/
            }),
            {
              begin: '"',
              end: '"',
              relevance: 0
            },
            {
              begin: "'",
              end: "'",
              relevance: 0
            }
          ],
        },

        // Matching numbers immediately following punctuation and operators is
        // tricky since we need to look at the character ahead of a number to
        // ensure the number is not part of an identifier, and we cannot use
        // negative look-behind assertions. So instead we explicitly handle all
        // possible combinations of (operator|punctuation), number.
        // TODO: replace with negative look-behind when available
        // { begin: /(?<![a-zA-Z0-9._])0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*[pP][+-]?\d+i?/ },
        // { begin: /(?<![a-zA-Z0-9._])0[xX][0-9a-fA-F]+([pP][+-]?\d+)?[Li]?/ },
        // { begin: /(?<![a-zA-Z0-9._])(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[Li]?/ }
        {
          relevance: 0,
          variants: [
            {
              scope: {
                1: 'operator',
                2: 'number'
              },
              match: [
                OPERATORS_RE,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: {
                1: 'operator',
                2: 'number'
              },
              match: [
                /%[^%]*%/,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: {
                1: 'punctuation',
                2: 'number'
              },
              match: [
                PUNCTUATION_RE,
                NUMBER_TYPES_RE
              ]
            },
            {
              scope: { 2: 'number' },
              match: [
                /[^a-zA-Z0-9._]|^/, // not part of an identifier, or start of document
                NUMBER_TYPES_RE
              ]
            }
          ]
        },

        // Operators/punctuation when they're not directly followed by numbers
        {
          // Relevance boost for the most common assignment form.
          scope: { 3: 'operator' },
          match: [
            IDENT_RE,
            /\s+/,
            /<-/,
            /\s+/
          ]
        },

        {
          scope: 'operator',
          relevance: 0,
          variants: [
            { match: OPERATORS_RE },
            { match: /%[^%]*%/ }
          ]
        },

        {
          scope: 'punctuation',
          relevance: 0,
          match: PUNCTUATION_RE
        },

        {
          // Escaped identifier
          begin: '`',
          end: '`',
          contains: [ { begin: /\\./ } ]
        }
      ]
    };
  }

  return r;

})();

    hljs.registerLanguage('r', hljsGrammar);
  })();/*! `rust` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Rust
  Author: Andrey Vlasovskikh <andrey.vlasovskikh@gmail.com>
  Contributors: Roman Shmatov <romanshmatov@gmail.com>, Kasper Andersen <kma_untrusted@protonmail.com>
  Website: https://www.rust-lang.org
  Category: common, system
  */

  /** @type LanguageFn */
  function rust(hljs) {
    const regex = hljs.regex;
    const FUNCTION_INVOKE = {
      className: "title.function.invoke",
      relevance: 0,
      begin: regex.concat(
        /\b/,
        /(?!let|for|while|if|else|match\b)/,
        hljs.IDENT_RE,
        regex.lookahead(/\s*\(/))
    };
    const NUMBER_SUFFIX = '([ui](8|16|32|64|128|size)|f(32|64))\?';
    const KEYWORDS = [
      "abstract",
      "as",
      "async",
      "await",
      "become",
      "box",
      "break",
      "const",
      "continue",
      "crate",
      "do",
      "dyn",
      "else",
      "enum",
      "extern",
      "false",
      "final",
      "fn",
      "for",
      "if",
      "impl",
      "in",
      "let",
      "loop",
      "macro",
      "match",
      "mod",
      "move",
      "mut",
      "override",
      "priv",
      "pub",
      "ref",
      "return",
      "self",
      "Self",
      "static",
      "struct",
      "super",
      "trait",
      "true",
      "try",
      "type",
      "typeof",
      "unsafe",
      "unsized",
      "use",
      "virtual",
      "where",
      "while",
      "yield"
    ];
    const LITERALS = [
      "true",
      "false",
      "Some",
      "None",
      "Ok",
      "Err"
    ];
    const BUILTINS = [
      // functions
      'drop ',
      // traits
      "Copy",
      "Send",
      "Sized",
      "Sync",
      "Drop",
      "Fn",
      "FnMut",
      "FnOnce",
      "ToOwned",
      "Clone",
      "Debug",
      "PartialEq",
      "PartialOrd",
      "Eq",
      "Ord",
      "AsRef",
      "AsMut",
      "Into",
      "From",
      "Default",
      "Iterator",
      "Extend",
      "IntoIterator",
      "DoubleEndedIterator",
      "ExactSizeIterator",
      "SliceConcatExt",
      "ToString",
      // macros
      "assert!",
      "assert_eq!",
      "bitflags!",
      "bytes!",
      "cfg!",
      "col!",
      "concat!",
      "concat_idents!",
      "debug_assert!",
      "debug_assert_eq!",
      "env!",
      "eprintln!",
      "panic!",
      "file!",
      "format!",
      "format_args!",
      "include_bytes!",
      "include_str!",
      "line!",
      "local_data_key!",
      "module_path!",
      "option_env!",
      "print!",
      "println!",
      "select!",
      "stringify!",
      "try!",
      "unimplemented!",
      "unreachable!",
      "vec!",
      "write!",
      "writeln!",
      "macro_rules!",
      "assert_ne!",
      "debug_assert_ne!"
    ];
    const TYPES = [
      "i8",
      "i16",
      "i32",
      "i64",
      "i128",
      "isize",
      "u8",
      "u16",
      "u32",
      "u64",
      "u128",
      "usize",
      "f32",
      "f64",
      "str",
      "char",
      "bool",
      "Box",
      "Option",
      "Result",
      "String",
      "Vec"
    ];
    return {
      name: 'Rust',
      aliases: [ 'rs' ],
      keywords: {
        $pattern: hljs.IDENT_RE + '!?',
        type: TYPES,
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: BUILTINS
      },
      illegal: '</',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.COMMENT('/\\*', '\\*/', { contains: [ 'self' ] }),
        hljs.inherit(hljs.QUOTE_STRING_MODE, {
          begin: /b?"/,
          illegal: null
        }),
        {
          className: 'string',
          variants: [
            { begin: /b?r(#*)"(.|\n)*?"\1(?!#)/ },
            { begin: /b?'\\?(x\w{2}|u\w{4}|U\w{8}|.)'/ }
          ]
        },
        {
          className: 'symbol',
          begin: /'[a-zA-Z_][a-zA-Z0-9_]*/
        },
        {
          className: 'number',
          variants: [
            { begin: '\\b0b([01_]+)' + NUMBER_SUFFIX },
            { begin: '\\b0o([0-7_]+)' + NUMBER_SUFFIX },
            { begin: '\\b0x([A-Fa-f0-9_]+)' + NUMBER_SUFFIX },
            { begin: '\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)'
                     + NUMBER_SUFFIX }
          ],
          relevance: 0
        },
        {
          begin: [
            /fn/,
            /\s+/,
            hljs.UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.function"
          }
        },
        {
          className: 'meta',
          begin: '#!?\\[',
          end: '\\]',
          contains: [
            {
              className: 'string',
              begin: /"/,
              end: /"/,
              contains: [
                hljs.BACKSLASH_ESCAPE
              ]
            }
          ]
        },
        {
          begin: [
            /let/,
            /\s+/,
            /(?:mut\s+)?/,
            hljs.UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "keyword",
            4: "variable"
          }
        },
        // must come before impl/for rule later
        {
          begin: [
            /for/,
            /\s+/,
            hljs.UNDERSCORE_IDENT_RE,
            /\s+/,
            /in/
          ],
          className: {
            1: "keyword",
            3: "variable",
            5: "keyword"
          }
        },
        {
          begin: [
            /type/,
            /\s+/,
            hljs.UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          begin: [
            /(?:trait|enum|struct|union|impl|for)/,
            /\s+/,
            hljs.UNDERSCORE_IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title.class"
          }
        },
        {
          begin: hljs.IDENT_RE + '::',
          keywords: {
            keyword: "Self",
            built_in: BUILTINS,
            type: TYPES
          }
        },
        {
          className: "punctuation",
          begin: '->'
        },
        FUNCTION_INVOKE
      ]
    };
  }

  return rust;

})();

    hljs.registerLanguage('rust', hljsGrammar);
  })();/*! `scheme` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Scheme
  Description: Scheme is a programming language in the Lisp family.
               (keywords based on http://community.schemewiki.org/?scheme-keywords)
  Author: JP Verkamp <me@jverkamp.com>
  Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Origin: clojure.js
  Website: http://community.schemewiki.org/?what-is-scheme
  Category: lisp
  */

  function scheme(hljs) {
    const SCHEME_IDENT_RE = '[^\\(\\)\\[\\]\\{\\}",\'`;#|\\\\\\s]+';
    const SCHEME_SIMPLE_NUMBER_RE = '(-|\\+)?\\d+([./]\\d+)?';
    const SCHEME_COMPLEX_NUMBER_RE = SCHEME_SIMPLE_NUMBER_RE + '[+\\-]' + SCHEME_SIMPLE_NUMBER_RE + 'i';
    const KEYWORDS = {
      $pattern: SCHEME_IDENT_RE,
      built_in:
        'case-lambda call/cc class define-class exit-handler field import '
        + 'inherit init-field interface let*-values let-values let/ec mixin '
        + 'opt-lambda override protect provide public rename require '
        + 'require-for-syntax syntax syntax-case syntax-error unit/sig unless '
        + 'when with-syntax and begin call-with-current-continuation '
        + 'call-with-input-file call-with-output-file case cond define '
        + 'define-syntax delay do dynamic-wind else for-each if lambda let let* '
        + 'let-syntax letrec letrec-syntax map or syntax-rules \' * + , ,@ - ... / '
        + '; < <= = => > >= ` abs acos angle append apply asin assoc assq assv atan '
        + 'boolean? caar cadr call-with-input-file call-with-output-file '
        + 'call-with-values car cdddar cddddr cdr ceiling char->integer '
        + 'char-alphabetic? char-ci<=? char-ci<? char-ci=? char-ci>=? char-ci>? '
        + 'char-downcase char-lower-case? char-numeric? char-ready? char-upcase '
        + 'char-upper-case? char-whitespace? char<=? char<? char=? char>=? char>? '
        + 'char? close-input-port close-output-port complex? cons cos '
        + 'current-input-port current-output-port denominator display eof-object? '
        + 'eq? equal? eqv? eval even? exact->inexact exact? exp expt floor '
        + 'force gcd imag-part inexact->exact inexact? input-port? integer->char '
        + 'integer? interaction-environment lcm length list list->string '
        + 'list->vector list-ref list-tail list? load log magnitude make-polar '
        + 'make-rectangular make-string make-vector max member memq memv min '
        + 'modulo negative? newline not null-environment null? number->string '
        + 'number? numerator odd? open-input-file open-output-file output-port? '
        + 'pair? peek-char port? positive? procedure? quasiquote quote quotient '
        + 'rational? rationalize read read-char real-part real? remainder reverse '
        + 'round scheme-report-environment set! set-car! set-cdr! sin sqrt string '
        + 'string->list string->number string->symbol string-append string-ci<=? '
        + 'string-ci<? string-ci=? string-ci>=? string-ci>? string-copy '
        + 'string-fill! string-length string-ref string-set! string<=? string<? '
        + 'string=? string>=? string>? string? substring symbol->string symbol? '
        + 'tan transcript-off transcript-on truncate values vector '
        + 'vector->list vector-fill! vector-length vector-ref vector-set! '
        + 'with-input-from-file with-output-to-file write write-char zero?'
    };

    const LITERAL = {
      className: 'literal',
      begin: '(#t|#f|#\\\\' + SCHEME_IDENT_RE + '|#\\\\.)'
    };

    const NUMBER = {
      className: 'number',
      variants: [
        {
          begin: SCHEME_SIMPLE_NUMBER_RE,
          relevance: 0
        },
        {
          begin: SCHEME_COMPLEX_NUMBER_RE,
          relevance: 0
        },
        { begin: '#b[0-1]+(/[0-1]+)?' },
        { begin: '#o[0-7]+(/[0-7]+)?' },
        { begin: '#x[0-9a-f]+(/[0-9a-f]+)?' }
      ]
    };

    const STRING = hljs.QUOTE_STRING_MODE;

    const COMMENT_MODES = [
      hljs.COMMENT(
        ';',
        '$',
        { relevance: 0 }
      ),
      hljs.COMMENT('#\\|', '\\|#')
    ];

    const IDENT = {
      begin: SCHEME_IDENT_RE,
      relevance: 0
    };

    const QUOTED_IDENT = {
      className: 'symbol',
      begin: '\'' + SCHEME_IDENT_RE
    };

    const BODY = {
      endsWithParent: true,
      relevance: 0
    };

    const QUOTED_LIST = {
      variants: [
        { begin: /'/ },
        { begin: '`' }
      ],
      contains: [
        {
          begin: '\\(',
          end: '\\)',
          contains: [
            'self',
            LITERAL,
            STRING,
            NUMBER,
            IDENT,
            QUOTED_IDENT
          ]
        }
      ]
    };

    const NAME = {
      className: 'name',
      relevance: 0,
      begin: SCHEME_IDENT_RE,
      keywords: KEYWORDS
    };

    const LAMBDA = {
      begin: /lambda/,
      endsWithParent: true,
      returnBegin: true,
      contains: [
        NAME,
        {
          endsParent: true,
          variants: [
            {
              begin: /\(/,
              end: /\)/
            },
            {
              begin: /\[/,
              end: /\]/
            }
          ],
          contains: [ IDENT ]
        }
      ]
    };

    const LIST = {
      variants: [
        {
          begin: '\\(',
          end: '\\)'
        },
        {
          begin: '\\[',
          end: '\\]'
        }
      ],
      contains: [
        LAMBDA,
        NAME,
        BODY
      ]
    };

    BODY.contains = [
      LITERAL,
      NUMBER,
      STRING,
      IDENT,
      QUOTED_IDENT,
      QUOTED_LIST,
      LIST
    ].concat(COMMENT_MODES);

    return {
      name: 'Scheme',
      aliases: ['scm'],
      illegal: /\S/,
      contains: [
        hljs.SHEBANG(),
        NUMBER,
        STRING,
        QUOTED_IDENT,
        QUOTED_LIST,
        LIST
      ].concat(COMMENT_MODES)
    };
  }

  return scheme;

})();

    hljs.registerLanguage('scheme', hljsGrammar);
  })();/*! `scss` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'p',
    'q',
    'quote',
    'samp',
    'section',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'animation',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-decoration-break',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'cx',
    'cy',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flow',
    'flood-color',
    'flood-opacity',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-size',
    'font-size-adjust',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-variant',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'inline-size',
    'isolation',
    'kerning',
    'justify-content',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'mask',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'pointer-events',
    'position',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'row-gap',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'speak',
    'speak-as',
    'src', // @font-face
    'tab-size',
    'table-layout',
    'text-anchor',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-style',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-transform',
    'text-underline-position',
    'top',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'unicode-bidi',
    'vector-effect',
    'vertical-align',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index'
  ].sort().reverse();

  /*
  Language: SCSS
  Description: Scss is an extension of the syntax of CSS.
  Author: Kurt Emch <kurt@kurtemch.com>
  Website: https://sass-lang.com
  Category: common, css, web
  */


  /** @type LanguageFn */
  function scss(hljs) {
    const modes = MODES(hljs);
    const PSEUDO_ELEMENTS$1 = PSEUDO_ELEMENTS;
    const PSEUDO_CLASSES$1 = PSEUDO_CLASSES;

    const AT_IDENTIFIER = '@[a-z-]+'; // @font-face
    const AT_MODIFIERS = "and or not only";
    const IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
    const VARIABLE = {
      className: 'variable',
      begin: '(\\$' + IDENT_RE + ')\\b',
      relevance: 0
    };

    return {
      name: 'SCSS',
      case_insensitive: true,
      illegal: '[=/|\']',
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        // to recognize keyframe 40% etc which are outside the scope of our
        // attribute value mode
        modes.CSS_NUMBER_MODE,
        {
          className: 'selector-id',
          begin: '#[A-Za-z0-9_-]+',
          relevance: 0
        },
        {
          className: 'selector-class',
          begin: '\\.[A-Za-z0-9_-]+',
          relevance: 0
        },
        modes.ATTRIBUTE_SELECTOR_MODE,
        {
          className: 'selector-tag',
          begin: '\\b(' + TAGS.join('|') + ')\\b',
          // was there, before, but why?
          relevance: 0
        },
        {
          className: 'selector-pseudo',
          begin: ':(' + PSEUDO_CLASSES$1.join('|') + ')'
        },
        {
          className: 'selector-pseudo',
          begin: ':(:)?(' + PSEUDO_ELEMENTS$1.join('|') + ')'
        },
        VARIABLE,
        { // pseudo-selector params
          begin: /\(/,
          end: /\)/,
          contains: [ modes.CSS_NUMBER_MODE ]
        },
        modes.CSS_VARIABLE,
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b'
        },
        { begin: '\\b(whitespace|wait|w-resize|visible|vertical-text|vertical-ideographic|uppercase|upper-roman|upper-alpha|underline|transparent|top|thin|thick|text|text-top|text-bottom|tb-rl|table-header-group|table-footer-group|sw-resize|super|strict|static|square|solid|small-caps|separate|se-resize|scroll|s-resize|rtl|row-resize|ridge|right|repeat|repeat-y|repeat-x|relative|progress|pointer|overline|outside|outset|oblique|nowrap|not-allowed|normal|none|nw-resize|no-repeat|no-drop|newspaper|ne-resize|n-resize|move|middle|medium|ltr|lr-tb|lowercase|lower-roman|lower-alpha|loose|list-item|line|line-through|line-edge|lighter|left|keep-all|justify|italic|inter-word|inter-ideograph|inside|inset|inline|inline-block|inherit|inactive|ideograph-space|ideograph-parenthesis|ideograph-numeric|ideograph-alpha|horizontal|hidden|help|hand|groove|fixed|ellipsis|e-resize|double|dotted|distribute|distribute-space|distribute-letter|distribute-all-lines|disc|disabled|default|decimal|dashed|crosshair|collapse|col-resize|circle|char|center|capitalize|break-word|break-all|bottom|both|bolder|bold|block|bidi-override|below|baseline|auto|always|all-scroll|absolute|table|table-cell)\\b' },
        {
          begin: /:/,
          end: /[;}{]/,
          relevance: 0,
          contains: [
            modes.BLOCK_COMMENT,
            VARIABLE,
            modes.HEXCOLOR,
            modes.CSS_NUMBER_MODE,
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            modes.IMPORTANT,
            modes.FUNCTION_DISPATCH
          ]
        },
        // matching these here allows us to treat them more like regular CSS
        // rules so everything between the {} gets regular rule highlighting,
        // which is what we want for page and font-face
        {
          begin: '@(page|font-face)',
          keywords: {
            $pattern: AT_IDENTIFIER,
            keyword: '@page @font-face'
          }
        },
        {
          begin: '@',
          end: '[{;]',
          returnBegin: true,
          keywords: {
            $pattern: /[a-z-]+/,
            keyword: AT_MODIFIERS,
            attribute: MEDIA_FEATURES.join(" ")
          },
          contains: [
            {
              begin: AT_IDENTIFIER,
              className: "keyword"
            },
            {
              begin: /[a-z-]+(?=:)/,
              className: "attribute"
            },
            VARIABLE,
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            modes.HEXCOLOR,
            modes.CSS_NUMBER_MODE
          ]
        },
        modes.FUNCTION_DISPATCH
      ]
    };
  }

  return scss;

})();

    hljs.registerLanguage('scss', hljsGrammar);
  })();/*! `shell` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Shell Session
  Requires: bash.js
  Author: TSUYUSATO Kitsune <make.just.on@gmail.com>
  Category: common
  Audit: 2020
  */

  /** @type LanguageFn */
  function shell(hljs) {
    return {
      name: 'Shell Session',
      aliases: [
        'console',
        'shellsession'
      ],
      contains: [
        {
          className: 'meta.prompt',
          // We cannot add \s (spaces) in the regular expression otherwise it will be too broad and produce unexpected result.
          // For instance, in the following example, it would match "echo /path/to/home >" as a prompt:
          // echo /path/to/home > t.exe
          begin: /^\s{0,3}[/~\w\d[\]()@-]*[>%$#][ ]?/,
          starts: {
            end: /[^\\](?=\s*$)/,
            subLanguage: 'bash'
          }
        }
      ]
    };
  }

  return shell;

})();

    hljs.registerLanguage('shell', hljsGrammar);
  })();/*! `sql` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: SQL
   Website: https://en.wikipedia.org/wiki/SQL
   Category: common, database
   */

  /*

  Goals:

  SQL is intended to highlight basic/common SQL keywords and expressions

  - If pretty much every single SQL server includes supports, then it's a canidate.
  - It is NOT intended to include tons of vendor specific keywords (Oracle, MySQL,
    PostgreSQL) although the list of data types is purposely a bit more expansive.
  - For more specific SQL grammars please see:
    - PostgreSQL and PL/pgSQL - core
    - T-SQL - https://github.com/highlightjs/highlightjs-tsql
    - sql_more (core)

   */

  function sql(hljs) {
    const regex = hljs.regex;
    const COMMENT_MODE = hljs.COMMENT('--', '$');
    const STRING = {
      className: 'string',
      variants: [
        {
          begin: /'/,
          end: /'/,
          contains: [ { begin: /''/ } ]
        }
      ]
    };
    const QUOTED_IDENTIFIER = {
      begin: /"/,
      end: /"/,
      contains: [ { begin: /""/ } ]
    };

    const LITERALS = [
      "true",
      "false",
      // Not sure it's correct to call NULL literal, and clauses like IS [NOT] NULL look strange that way.
      // "null",
      "unknown"
    ];

    const MULTI_WORD_TYPES = [
      "double precision",
      "large object",
      "with timezone",
      "without timezone"
    ];

    const TYPES = [
      'bigint',
      'binary',
      'blob',
      'boolean',
      'char',
      'character',
      'clob',
      'date',
      'dec',
      'decfloat',
      'decimal',
      'float',
      'int',
      'integer',
      'interval',
      'nchar',
      'nclob',
      'national',
      'numeric',
      'real',
      'row',
      'smallint',
      'time',
      'timestamp',
      'varchar',
      'varying', // modifier (character varying)
      'varbinary'
    ];

    const NON_RESERVED_WORDS = [
      "add",
      "asc",
      "collation",
      "desc",
      "final",
      "first",
      "last",
      "view"
    ];

    // https://jakewheat.github.io/sql-overview/sql-2016-foundation-grammar.html#reserved-word
    const RESERVED_WORDS = [
      "abs",
      "acos",
      "all",
      "allocate",
      "alter",
      "and",
      "any",
      "are",
      "array",
      "array_agg",
      "array_max_cardinality",
      "as",
      "asensitive",
      "asin",
      "asymmetric",
      "at",
      "atan",
      "atomic",
      "authorization",
      "avg",
      "begin",
      "begin_frame",
      "begin_partition",
      "between",
      "bigint",
      "binary",
      "blob",
      "boolean",
      "both",
      "by",
      "call",
      "called",
      "cardinality",
      "cascaded",
      "case",
      "cast",
      "ceil",
      "ceiling",
      "char",
      "char_length",
      "character",
      "character_length",
      "check",
      "classifier",
      "clob",
      "close",
      "coalesce",
      "collate",
      "collect",
      "column",
      "commit",
      "condition",
      "connect",
      "constraint",
      "contains",
      "convert",
      "copy",
      "corr",
      "corresponding",
      "cos",
      "cosh",
      "count",
      "covar_pop",
      "covar_samp",
      "create",
      "cross",
      "cube",
      "cume_dist",
      "current",
      "current_catalog",
      "current_date",
      "current_default_transform_group",
      "current_path",
      "current_role",
      "current_row",
      "current_schema",
      "current_time",
      "current_timestamp",
      "current_path",
      "current_role",
      "current_transform_group_for_type",
      "current_user",
      "cursor",
      "cycle",
      "date",
      "day",
      "deallocate",
      "dec",
      "decimal",
      "decfloat",
      "declare",
      "default",
      "define",
      "delete",
      "dense_rank",
      "deref",
      "describe",
      "deterministic",
      "disconnect",
      "distinct",
      "double",
      "drop",
      "dynamic",
      "each",
      "element",
      "else",
      "empty",
      "end",
      "end_frame",
      "end_partition",
      "end-exec",
      "equals",
      "escape",
      "every",
      "except",
      "exec",
      "execute",
      "exists",
      "exp",
      "external",
      "extract",
      "false",
      "fetch",
      "filter",
      "first_value",
      "float",
      "floor",
      "for",
      "foreign",
      "frame_row",
      "free",
      "from",
      "full",
      "function",
      "fusion",
      "get",
      "global",
      "grant",
      "group",
      "grouping",
      "groups",
      "having",
      "hold",
      "hour",
      "identity",
      "in",
      "indicator",
      "initial",
      "inner",
      "inout",
      "insensitive",
      "insert",
      "int",
      "integer",
      "intersect",
      "intersection",
      "interval",
      "into",
      "is",
      "join",
      "json_array",
      "json_arrayagg",
      "json_exists",
      "json_object",
      "json_objectagg",
      "json_query",
      "json_table",
      "json_table_primitive",
      "json_value",
      "lag",
      "language",
      "large",
      "last_value",
      "lateral",
      "lead",
      "leading",
      "left",
      "like",
      "like_regex",
      "listagg",
      "ln",
      "local",
      "localtime",
      "localtimestamp",
      "log",
      "log10",
      "lower",
      "match",
      "match_number",
      "match_recognize",
      "matches",
      "max",
      "member",
      "merge",
      "method",
      "min",
      "minute",
      "mod",
      "modifies",
      "module",
      "month",
      "multiset",
      "national",
      "natural",
      "nchar",
      "nclob",
      "new",
      "no",
      "none",
      "normalize",
      "not",
      "nth_value",
      "ntile",
      "null",
      "nullif",
      "numeric",
      "octet_length",
      "occurrences_regex",
      "of",
      "offset",
      "old",
      "omit",
      "on",
      "one",
      "only",
      "open",
      "or",
      "order",
      "out",
      "outer",
      "over",
      "overlaps",
      "overlay",
      "parameter",
      "partition",
      "pattern",
      "per",
      "percent",
      "percent_rank",
      "percentile_cont",
      "percentile_disc",
      "period",
      "portion",
      "position",
      "position_regex",
      "power",
      "precedes",
      "precision",
      "prepare",
      "primary",
      "procedure",
      "ptf",
      "range",
      "rank",
      "reads",
      "real",
      "recursive",
      "ref",
      "references",
      "referencing",
      "regr_avgx",
      "regr_avgy",
      "regr_count",
      "regr_intercept",
      "regr_r2",
      "regr_slope",
      "regr_sxx",
      "regr_sxy",
      "regr_syy",
      "release",
      "result",
      "return",
      "returns",
      "revoke",
      "right",
      "rollback",
      "rollup",
      "row",
      "row_number",
      "rows",
      "running",
      "savepoint",
      "scope",
      "scroll",
      "search",
      "second",
      "seek",
      "select",
      "sensitive",
      "session_user",
      "set",
      "show",
      "similar",
      "sin",
      "sinh",
      "skip",
      "smallint",
      "some",
      "specific",
      "specifictype",
      "sql",
      "sqlexception",
      "sqlstate",
      "sqlwarning",
      "sqrt",
      "start",
      "static",
      "stddev_pop",
      "stddev_samp",
      "submultiset",
      "subset",
      "substring",
      "substring_regex",
      "succeeds",
      "sum",
      "symmetric",
      "system",
      "system_time",
      "system_user",
      "table",
      "tablesample",
      "tan",
      "tanh",
      "then",
      "time",
      "timestamp",
      "timezone_hour",
      "timezone_minute",
      "to",
      "trailing",
      "translate",
      "translate_regex",
      "translation",
      "treat",
      "trigger",
      "trim",
      "trim_array",
      "true",
      "truncate",
      "uescape",
      "union",
      "unique",
      "unknown",
      "unnest",
      "update",
      "upper",
      "user",
      "using",
      "value",
      "values",
      "value_of",
      "var_pop",
      "var_samp",
      "varbinary",
      "varchar",
      "varying",
      "versioning",
      "when",
      "whenever",
      "where",
      "width_bucket",
      "window",
      "with",
      "within",
      "without",
      "year",
    ];

    // these are reserved words we have identified to be functions
    // and should only be highlighted in a dispatch-like context
    // ie, array_agg(...), etc.
    const RESERVED_FUNCTIONS = [
      "abs",
      "acos",
      "array_agg",
      "asin",
      "atan",
      "avg",
      "cast",
      "ceil",
      "ceiling",
      "coalesce",
      "corr",
      "cos",
      "cosh",
      "count",
      "covar_pop",
      "covar_samp",
      "cume_dist",
      "dense_rank",
      "deref",
      "element",
      "exp",
      "extract",
      "first_value",
      "floor",
      "json_array",
      "json_arrayagg",
      "json_exists",
      "json_object",
      "json_objectagg",
      "json_query",
      "json_table",
      "json_table_primitive",
      "json_value",
      "lag",
      "last_value",
      "lead",
      "listagg",
      "ln",
      "log",
      "log10",
      "lower",
      "max",
      "min",
      "mod",
      "nth_value",
      "ntile",
      "nullif",
      "percent_rank",
      "percentile_cont",
      "percentile_disc",
      "position",
      "position_regex",
      "power",
      "rank",
      "regr_avgx",
      "regr_avgy",
      "regr_count",
      "regr_intercept",
      "regr_r2",
      "regr_slope",
      "regr_sxx",
      "regr_sxy",
      "regr_syy",
      "row_number",
      "sin",
      "sinh",
      "sqrt",
      "stddev_pop",
      "stddev_samp",
      "substring",
      "substring_regex",
      "sum",
      "tan",
      "tanh",
      "translate",
      "translate_regex",
      "treat",
      "trim",
      "trim_array",
      "unnest",
      "upper",
      "value_of",
      "var_pop",
      "var_samp",
      "width_bucket",
    ];

    // these functions can
    const POSSIBLE_WITHOUT_PARENS = [
      "current_catalog",
      "current_date",
      "current_default_transform_group",
      "current_path",
      "current_role",
      "current_schema",
      "current_transform_group_for_type",
      "current_user",
      "session_user",
      "system_time",
      "system_user",
      "current_time",
      "localtime",
      "current_timestamp",
      "localtimestamp"
    ];

    // those exist to boost relevance making these very
    // "SQL like" keyword combos worth +1 extra relevance
    const COMBOS = [
      "create table",
      "insert into",
      "primary key",
      "foreign key",
      "not null",
      "alter table",
      "add constraint",
      "grouping sets",
      "on overflow",
      "character set",
      "respect nulls",
      "ignore nulls",
      "nulls first",
      "nulls last",
      "depth first",
      "breadth first"
    ];

    const FUNCTIONS = RESERVED_FUNCTIONS;

    const KEYWORDS = [
      ...RESERVED_WORDS,
      ...NON_RESERVED_WORDS
    ].filter((keyword) => {
      return !RESERVED_FUNCTIONS.includes(keyword);
    });

    const VARIABLE = {
      className: "variable",
      begin: /@[a-z0-9][a-z0-9_]*/,
    };

    const OPERATOR = {
      className: "operator",
      begin: /[-+*/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?/,
      relevance: 0,
    };

    const FUNCTION_CALL = {
      begin: regex.concat(/\b/, regex.either(...FUNCTIONS), /\s*\(/),
      relevance: 0,
      keywords: { built_in: FUNCTIONS }
    };

    // keywords with less than 3 letters are reduced in relevancy
    function reduceRelevancy(list, {
      exceptions, when
    } = {}) {
      const qualifyFn = when;
      exceptions = exceptions || [];
      return list.map((item) => {
        if (item.match(/\|\d+$/) || exceptions.includes(item)) {
          return item;
        } else if (qualifyFn(item)) {
          return `${item}|0`;
        } else {
          return item;
        }
      });
    }

    return {
      name: 'SQL',
      case_insensitive: true,
      // does not include {} or HTML tags `</`
      illegal: /[{}]|<\//,
      keywords: {
        $pattern: /\b[\w\.]+/,
        keyword:
          reduceRelevancy(KEYWORDS, { when: (x) => x.length < 3 }),
        literal: LITERALS,
        type: TYPES,
        built_in: POSSIBLE_WITHOUT_PARENS
      },
      contains: [
        {
          begin: regex.either(...COMBOS),
          relevance: 0,
          keywords: {
            $pattern: /[\w\.]+/,
            keyword: KEYWORDS.concat(COMBOS),
            literal: LITERALS,
            type: TYPES
          },
        },
        {
          className: "type",
          begin: regex.either(...MULTI_WORD_TYPES)
        },
        FUNCTION_CALL,
        VARIABLE,
        STRING,
        QUOTED_IDENTIFIER,
        hljs.C_NUMBER_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        COMMENT_MODE,
        OPERATOR
      ]
    };
  }

  return sql;

})();

    hljs.registerLanguage('sql', hljsGrammar);
  })();/*! `stata` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Stata
  Author: Brian Quistorff <bquistorff@gmail.com>
  Contributors: Drew McDonald <drewmcdo@gmail.com>
  Description: Stata is a general-purpose statistical software package created in 1985 by StataCorp.
  Website: https://en.wikipedia.org/wiki/Stata
  Category: scientific
  */

  /*
    This is a fork and modification of Drew McDonald's file (https://github.com/drewmcdonald/stata-highlighting). I have also included a list of builtin commands from https://bugs.kde.org/show_bug.cgi?id=135646.
  */

  function stata(hljs) {
    return {
      name: 'Stata',
      aliases: [
        'do',
        'ado'
      ],
      case_insensitive: true,
      keywords: 'if else in foreach for forv forva forval forvalu forvalue forvalues by bys bysort xi quietly qui capture about ac ac_7 acprplot acprplot_7 adjust ado adopath adoupdate alpha ameans an ano anov anova anova_estat anova_terms anovadef aorder ap app appe appen append arch arch_dr arch_estat arch_p archlm areg areg_p args arima arima_dr arima_estat arima_p as asmprobit asmprobit_estat asmprobit_lf asmprobit_mfx__dlg asmprobit_p ass asse asser assert avplot avplot_7 avplots avplots_7 bcskew0 bgodfrey bias binreg bip0_lf biplot bipp_lf bipr_lf bipr_p biprobit bitest bitesti bitowt blogit bmemsize boot bootsamp bootstrap bootstrap_8 boxco_l boxco_p boxcox boxcox_6 boxcox_p bprobit br break brier bro brow brows browse brr brrstat bs bs_7 bsampl_w bsample bsample_7 bsqreg bstat bstat_7 bstat_8 bstrap bstrap_7 bubble bubbleplot ca ca_estat ca_p cabiplot camat canon canon_8 canon_8_p canon_estat canon_p cap caprojection capt captu captur capture cat cc cchart cchart_7 cci cd censobs_table centile cf char chdir checkdlgfiles checkestimationsample checkhlpfiles checksum chelp ci cii cl class classutil clear cli clis clist clo clog clog_lf clog_p clogi clogi_sw clogit clogit_lf clogit_p clogitp clogl_sw cloglog clonevar clslistarray cluster cluster_measures cluster_stop cluster_tree cluster_tree_8 clustermat cmdlog cnr cnre cnreg cnreg_p cnreg_sw cnsreg codebook collaps4 collapse colormult_nb colormult_nw compare compress conf confi confir confirm conren cons const constr constra constrai constrain constraint continue contract copy copyright copysource cor corc corr corr2data corr_anti corr_kmo corr_smc corre correl correla correlat correlate corrgram cou coun count cox cox_p cox_sw coxbase coxhaz coxvar cprplot cprplot_7 crc cret cretu cretur creturn cross cs cscript cscript_log csi ct ct_is ctset ctst_5 ctst_st cttost cumsp cumsp_7 cumul cusum cusum_7 cutil d|0 datasig datasign datasigna datasignat datasignatu datasignatur datasignature datetof db dbeta de dec deco decod decode deff des desc descr descri describ describe destring dfbeta dfgls dfuller di di_g dir dirstats dis discard disp disp_res disp_s displ displa display distinct do doe doed doedi doedit dotplot dotplot_7 dprobit drawnorm drop ds ds_util dstdize duplicates durbina dwstat dydx e|0 ed edi edit egen eivreg emdef en enc enco encod encode eq erase ereg ereg_lf ereg_p ereg_sw ereghet ereghet_glf ereghet_glf_sh ereghet_gp ereghet_ilf ereghet_ilf_sh ereghet_ip eret eretu eretur ereturn err erro error esize est est_cfexist est_cfname est_clickable est_expand est_hold est_table est_unhold est_unholdok estat estat_default estat_summ estat_vce_only esti estimates etodow etof etomdy ex exi exit expand expandcl fac fact facto factor factor_estat factor_p factor_pca_rotated factor_rotate factormat fcast fcast_compute fcast_graph fdades fdadesc fdadescr fdadescri fdadescrib fdadescribe fdasav fdasave fdause fh_st file open file read file close file filefilter fillin find_hlp_file findfile findit findit_7 fit fl fli flis flist for5_0 forest forestplot form forma format fpredict frac_154 frac_adj frac_chk frac_cox frac_ddp frac_dis frac_dv frac_in frac_mun frac_pp frac_pq frac_pv frac_wgt frac_xo fracgen fracplot fracplot_7 fracpoly fracpred fron_ex fron_hn fron_p fron_tn fron_tn2 frontier ftodate ftoe ftomdy ftowdate funnel funnelplot g|0 gamhet_glf gamhet_gp gamhet_ilf gamhet_ip gamma gamma_d2 gamma_p gamma_sw gammahet gdi_hexagon gdi_spokes ge gen gene gener genera generat generate genrank genstd genvmean gettoken gl gladder gladder_7 glim_l01 glim_l02 glim_l03 glim_l04 glim_l05 glim_l06 glim_l07 glim_l08 glim_l09 glim_l10 glim_l11 glim_l12 glim_lf glim_mu glim_nw1 glim_nw2 glim_nw3 glim_p glim_v1 glim_v2 glim_v3 glim_v4 glim_v5 glim_v6 glim_v7 glm glm_6 glm_p glm_sw glmpred glo glob globa global glogit glogit_8 glogit_p gmeans gnbre_lf gnbreg gnbreg_5 gnbreg_p gomp_lf gompe_sw gomper_p gompertz gompertzhet gomphet_glf gomphet_glf_sh gomphet_gp gomphet_ilf gomphet_ilf_sh gomphet_ip gphdot gphpen gphprint gprefs gprobi_p gprobit gprobit_8 gr gr7 gr_copy gr_current gr_db gr_describe gr_dir gr_draw gr_draw_replay gr_drop gr_edit gr_editviewopts gr_example gr_example2 gr_export gr_print gr_qscheme gr_query gr_read gr_rename gr_replay gr_save gr_set gr_setscheme gr_table gr_undo gr_use graph graph7 grebar greigen greigen_7 greigen_8 grmeanby grmeanby_7 gs_fileinfo gs_filetype gs_graphinfo gs_stat gsort gwood h|0 hadimvo hareg hausman haver he heck_d2 heckma_p heckman heckp_lf heckpr_p heckprob hel help hereg hetpr_lf hetpr_p hetprob hettest hexdump hilite hist hist_7 histogram hlogit hlu hmeans hotel hotelling hprobit hreg hsearch icd9 icd9_ff icd9p iis impute imtest inbase include inf infi infil infile infix inp inpu input ins insheet insp inspe inspec inspect integ inten intreg intreg_7 intreg_p intrg2_ll intrg_ll intrg_ll2 ipolate iqreg ir irf irf_create irfm iri is_svy is_svysum isid istdize ivprob_1_lf ivprob_lf ivprobit ivprobit_p ivreg ivreg_footnote ivtob_1_lf ivtob_lf ivtobit ivtobit_p jackknife jacknife jknife jknife_6 jknife_8 jkstat joinby kalarma1 kap kap_3 kapmeier kappa kapwgt kdensity kdensity_7 keep ksm ksmirnov ktau kwallis l|0 la lab labbe labbeplot labe label labelbook ladder levels levelsof leverage lfit lfit_p li lincom line linktest lis list lloghet_glf lloghet_glf_sh lloghet_gp lloghet_ilf lloghet_ilf_sh lloghet_ip llogi_sw llogis_p llogist llogistic llogistichet lnorm_lf lnorm_sw lnorma_p lnormal lnormalhet lnormhet_glf lnormhet_glf_sh lnormhet_gp lnormhet_ilf lnormhet_ilf_sh lnormhet_ip lnskew0 loadingplot loc loca local log logi logis_lf logistic logistic_p logit logit_estat logit_p loglogs logrank loneway lookfor lookup lowess lowess_7 lpredict lrecomp lroc lroc_7 lrtest ls lsens lsens_7 lsens_x lstat ltable ltable_7 ltriang lv lvr2plot lvr2plot_7 m|0 ma mac macr macro makecns man manova manova_estat manova_p manovatest mantel mark markin markout marksample mat mat_capp mat_order mat_put_rr mat_rapp mata mata_clear mata_describe mata_drop mata_matdescribe mata_matsave mata_matuse mata_memory mata_mlib mata_mosave mata_rename mata_which matalabel matcproc matlist matname matr matri matrix matrix_input__dlg matstrik mcc mcci md0_ md1_ md1debug_ md2_ md2debug_ mds mds_estat mds_p mdsconfig mdslong mdsmat mdsshepard mdytoe mdytof me_derd mean means median memory memsize menl meqparse mer merg merge meta mfp mfx mhelp mhodds minbound mixed_ll mixed_ll_reparm mkassert mkdir mkmat mkspline ml ml_5 ml_adjs ml_bhhhs ml_c_d ml_check ml_clear ml_cnt ml_debug ml_defd ml_e0 ml_e0_bfgs ml_e0_cycle ml_e0_dfp ml_e0i ml_e1 ml_e1_bfgs ml_e1_bhhh ml_e1_cycle ml_e1_dfp ml_e2 ml_e2_cycle ml_ebfg0 ml_ebfr0 ml_ebfr1 ml_ebh0q ml_ebhh0 ml_ebhr0 ml_ebr0i ml_ecr0i ml_edfp0 ml_edfr0 ml_edfr1 ml_edr0i ml_eds ml_eer0i ml_egr0i ml_elf ml_elf_bfgs ml_elf_bhhh ml_elf_cycle ml_elf_dfp ml_elfi ml_elfs ml_enr0i ml_enrr0 ml_erdu0 ml_erdu0_bfgs ml_erdu0_bhhh ml_erdu0_bhhhq ml_erdu0_cycle ml_erdu0_dfp ml_erdu0_nrbfgs ml_exde ml_footnote ml_geqnr ml_grad0 ml_graph ml_hbhhh ml_hd0 ml_hold ml_init ml_inv ml_log ml_max ml_mlout ml_mlout_8 ml_model ml_nb0 ml_opt ml_p ml_plot ml_query ml_rdgrd ml_repor ml_s_e ml_score ml_searc ml_technique ml_unhold mleval mlf_ mlmatbysum mlmatsum mlog mlogi mlogit mlogit_footnote mlogit_p mlopts mlsum mlvecsum mnl0_ mor more mov move mprobit mprobit_lf mprobit_p mrdu0_ mrdu1_ mvdecode mvencode mvreg mvreg_estat n|0 nbreg nbreg_al nbreg_lf nbreg_p nbreg_sw nestreg net newey newey_7 newey_p news nl nl_7 nl_9 nl_9_p nl_p nl_p_7 nlcom nlcom_p nlexp2 nlexp2_7 nlexp2a nlexp2a_7 nlexp3 nlexp3_7 nlgom3 nlgom3_7 nlgom4 nlgom4_7 nlinit nllog3 nllog3_7 nllog4 nllog4_7 nlog_rd nlogit nlogit_p nlogitgen nlogittree nlpred no nobreak noi nois noisi noisil noisily note notes notes_dlg nptrend numlabel numlist odbc old_ver olo olog ologi ologi_sw ologit ologit_p ologitp on one onew onewa oneway op_colnm op_comp op_diff op_inv op_str opr opro oprob oprob_sw oprobi oprobi_p oprobit oprobitp opts_exclusive order orthog orthpoly ou out outf outfi outfil outfile outs outsh outshe outshee outsheet ovtest pac pac_7 palette parse parse_dissim pause pca pca_8 pca_display pca_estat pca_p pca_rotate pcamat pchart pchart_7 pchi pchi_7 pcorr pctile pentium pergram pergram_7 permute permute_8 personal peto_st pkcollapse pkcross pkequiv pkexamine pkexamine_7 pkshape pksumm pksumm_7 pl plo plot plugin pnorm pnorm_7 poisgof poiss_lf poiss_sw poisso_p poisson poisson_estat post postclose postfile postutil pperron pr prais prais_e prais_e2 prais_p predict predictnl preserve print pro prob probi probit probit_estat probit_p proc_time procoverlay procrustes procrustes_estat procrustes_p profiler prog progr progra program prop proportion prtest prtesti pwcorr pwd q\\s qby qbys qchi qchi_7 qladder qladder_7 qnorm qnorm_7 qqplot qqplot_7 qreg qreg_c qreg_p qreg_sw qu quadchk quantile quantile_7 que quer query range ranksum ratio rchart rchart_7 rcof recast reclink recode reg reg3 reg3_p regdw regr regre regre_p2 regres regres_p regress regress_estat regriv_p remap ren rena renam rename renpfix repeat replace report reshape restore ret retu retur return rm rmdir robvar roccomp roccomp_7 roccomp_8 rocf_lf rocfit rocfit_8 rocgold rocplot rocplot_7 roctab roctab_7 rolling rologit rologit_p rot rota rotat rotate rotatemat rreg rreg_p ru run runtest rvfplot rvfplot_7 rvpplot rvpplot_7 sa safesum sample sampsi sav save savedresults saveold sc sca scal scala scalar scatter scm_mine sco scob_lf scob_p scobi_sw scobit scor score scoreplot scoreplot_help scree screeplot screeplot_help sdtest sdtesti se search separate seperate serrbar serrbar_7 serset set set_defaults sfrancia sh she shel shell shewhart shewhart_7 signestimationsample signrank signtest simul simul_7 simulate simulate_8 sktest sleep slogit slogit_d2 slogit_p smooth snapspan so sor sort spearman spikeplot spikeplot_7 spikeplt spline_x split sqreg sqreg_p sret sretu sretur sreturn ssc st st_ct st_hc st_hcd st_hcd_sh st_is st_issys st_note st_promo st_set st_show st_smpl st_subid stack statsby statsby_8 stbase stci stci_7 stcox stcox_estat stcox_fr stcox_fr_ll stcox_p stcox_sw stcoxkm stcoxkm_7 stcstat stcurv stcurve stcurve_7 stdes stem stepwise stereg stfill stgen stir stjoin stmc stmh stphplot stphplot_7 stphtest stphtest_7 stptime strate strate_7 streg streg_sw streset sts sts_7 stset stsplit stsum sttocc sttoct stvary stweib su suest suest_8 sum summ summa summar summari summariz summarize sunflower sureg survcurv survsum svar svar_p svmat svy svy_disp svy_dreg svy_est svy_est_7 svy_estat svy_get svy_gnbreg_p svy_head svy_header svy_heckman_p svy_heckprob_p svy_intreg_p svy_ivreg_p svy_logistic_p svy_logit_p svy_mlogit_p svy_nbreg_p svy_ologit_p svy_oprobit_p svy_poisson_p svy_probit_p svy_regress_p svy_sub svy_sub_7 svy_x svy_x_7 svy_x_p svydes svydes_8 svygen svygnbreg svyheckman svyheckprob svyintreg svyintreg_7 svyintrg svyivreg svylc svylog_p svylogit svymarkout svymarkout_8 svymean svymlog svymlogit svynbreg svyolog svyologit svyoprob svyoprobit svyopts svypois svypois_7 svypoisson svyprobit svyprobt svyprop svyprop_7 svyratio svyreg svyreg_p svyregress svyset svyset_7 svyset_8 svytab svytab_7 svytest svytotal sw sw_8 swcnreg swcox swereg swilk swlogis swlogit swologit swoprbt swpois swprobit swqreg swtobit swweib symmetry symmi symplot symplot_7 syntax sysdescribe sysdir sysuse szroeter ta tab tab1 tab2 tab_or tabd tabdi tabdis tabdisp tabi table tabodds tabodds_7 tabstat tabu tabul tabula tabulat tabulate te tempfile tempname tempvar tes test testnl testparm teststd tetrachoric time_it timer tis tob tobi tobit tobit_p tobit_sw token tokeni tokeniz tokenize tostring total translate translator transmap treat_ll treatr_p treatreg trim trimfill trnb_cons trnb_mean trpoiss_d2 trunc_ll truncr_p truncreg tsappend tset tsfill tsline tsline_ex tsreport tsrevar tsrline tsset tssmooth tsunab ttest ttesti tut_chk tut_wait tutorial tw tware_st two twoway twoway__fpfit_serset twoway__function_gen twoway__histogram_gen twoway__ipoint_serset twoway__ipoints_serset twoway__kdensity_gen twoway__lfit_serset twoway__normgen_gen twoway__pci_serset twoway__qfit_serset twoway__scatteri_serset twoway__sunflower_gen twoway_ksm_serset ty typ type typeof u|0 unab unabbrev unabcmd update us use uselabel var var_mkcompanion var_p varbasic varfcast vargranger varirf varirf_add varirf_cgraph varirf_create varirf_ctable varirf_describe varirf_dir varirf_drop varirf_erase varirf_graph varirf_ograph varirf_rename varirf_set varirf_table varlist varlmar varnorm varsoc varstable varstable_w varstable_w2 varwle vce vec vec_fevd vec_mkphi vec_p vec_p_w vecirf_create veclmar veclmar_w vecnorm vecnorm_w vecrank vecstable verinst vers versi versio version view viewsource vif vwls wdatetof webdescribe webseek webuse weib1_lf weib2_lf weib_lf weib_lf0 weibhet_glf weibhet_glf_sh weibhet_glfa weibhet_glfa_sh weibhet_gp weibhet_ilf weibhet_ilf_sh weibhet_ilfa weibhet_ilfa_sh weibhet_ip weibu_sw weibul_p weibull weibull_c weibull_s weibullhet wh whelp whi which whil while wilc_st wilcoxon win wind windo window winexec wntestb wntestb_7 wntestq xchart xchart_7 xcorr xcorr_7 xi xi_6 xmlsav xmlsave xmluse xpose xsh xshe xshel xshell xt_iis xt_tis xtab_p xtabond xtbin_p xtclog xtcloglog xtcloglog_8 xtcloglog_d2 xtcloglog_pa_p xtcloglog_re_p xtcnt_p xtcorr xtdata xtdes xtfront_p xtfrontier xtgee xtgee_elink xtgee_estat xtgee_makeivar xtgee_p xtgee_plink xtgls xtgls_p xthaus xthausman xtht_p xthtaylor xtile xtint_p xtintreg xtintreg_8 xtintreg_d2 xtintreg_p xtivp_1 xtivp_2 xtivreg xtline xtline_ex xtlogit xtlogit_8 xtlogit_d2 xtlogit_fe_p xtlogit_pa_p xtlogit_re_p xtmixed xtmixed_estat xtmixed_p xtnb_fe xtnb_lf xtnbreg xtnbreg_pa_p xtnbreg_refe_p xtpcse xtpcse_p xtpois xtpoisson xtpoisson_d2 xtpoisson_pa_p xtpoisson_refe_p xtpred xtprobit xtprobit_8 xtprobit_d2 xtprobit_re_p xtps_fe xtps_lf xtps_ren xtps_ren_8 xtrar_p xtrc xtrc_p xtrchh xtrefe_p xtreg xtreg_be xtreg_fe xtreg_ml xtreg_pa_p xtreg_re xtregar xtrere_p xtset xtsf_ll xtsf_llti xtsum xttab xttest0 xttobit xttobit_8 xttobit_p xttrans yx yxview__barlike_draw yxview_area_draw yxview_bar_draw yxview_dot_draw yxview_dropline_draw yxview_function_draw yxview_iarrow_draw yxview_ilabels_draw yxview_normal_draw yxview_pcarrow_draw yxview_pcbarrow_draw yxview_pccapsym_draw yxview_pcscatter_draw yxview_pcspike_draw yxview_rarea_draw yxview_rbar_draw yxview_rbarm_draw yxview_rcap_draw yxview_rcapsym_draw yxview_rconnected_draw yxview_rline_draw yxview_rscatter_draw yxview_rspike_draw yxview_spike_draw yxview_sunflower_draw zap_s zinb zinb_llf zinb_plf zip zip_llf zip_p zip_plf zt_ct_5 zt_hc_5 zt_hcd_5 zt_is_5 zt_iss_5 zt_sho_5 zt_smp_5 ztbase_5 ztcox_5 ztdes_5 ztereg_5 ztfill_5 ztgen_5 ztir_5 ztjoin_5 ztnb ztnb_p ztp ztp_p zts_5 ztset_5 ztspli_5 ztsum_5 zttoct_5 ztvary_5 ztweib_5',
      contains: [
        {
          className: 'symbol',
          begin: /`[a-zA-Z0-9_]+'/
        },
        {
          className: 'variable',
          begin: /\$\{?[a-zA-Z0-9_]+\}?/,
          relevance: 0
        },
        {
          className: 'string',
          variants: [
            { begin: '`"[^\r\n]*?"\'' },
            { begin: '"[^\r\n"]*"' }
          ]
        },

        {
          className: 'built_in',
          variants: [ { begin: '\\b(abs|acos|asin|atan|atan2|atanh|ceil|cloglog|comb|cos|digamma|exp|floor|invcloglog|invlogit|ln|lnfact|lnfactorial|lngamma|log|log10|max|min|mod|reldif|round|sign|sin|sqrt|sum|tan|tanh|trigamma|trunc|betaden|Binomial|binorm|binormal|chi2|chi2tail|dgammapda|dgammapdada|dgammapdadx|dgammapdx|dgammapdxdx|F|Fden|Ftail|gammaden|gammap|ibeta|invbinomial|invchi2|invchi2tail|invF|invFtail|invgammap|invibeta|invnchi2|invnFtail|invnibeta|invnorm|invnormal|invttail|nbetaden|nchi2|nFden|nFtail|nibeta|norm|normal|normalden|normd|npnchi2|tden|ttail|uniform|abbrev|char|index|indexnot|length|lower|ltrim|match|plural|proper|real|regexm|regexr|regexs|reverse|rtrim|string|strlen|strlower|strltrim|strmatch|strofreal|strpos|strproper|strreverse|strrtrim|strtrim|strupper|subinstr|subinword|substr|trim|upper|word|wordcount|_caller|autocode|byteorder|chop|clip|cond|e|epsdouble|epsfloat|group|inlist|inrange|irecode|matrix|maxbyte|maxdouble|maxfloat|maxint|maxlong|mi|minbyte|mindouble|minfloat|minint|minlong|missing|r|recode|replay|return|s|scalar|d|date|day|dow|doy|halfyear|mdy|month|quarter|week|year|d|daily|dofd|dofh|dofm|dofq|dofw|dofy|h|halfyearly|hofd|m|mofd|monthly|q|qofd|quarterly|tin|twithin|w|weekly|wofd|y|yearly|yh|ym|yofd|yq|yw|cholesky|colnumb|colsof|corr|det|diag|diag0cnt|el|get|hadamard|I|inv|invsym|issym|issymmetric|J|matmissing|matuniform|mreldif|nullmat|rownumb|rowsof|sweep|syminv|trace|vec|vecdiag)(?=\\()' } ]
        },

        hljs.COMMENT('^[ \t]*\\*.*$', false),
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };
  }

  return stata;

})();

    hljs.registerLanguage('stata', hljsGrammar);
  })();/*! `stylus` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  const MODES = (hljs) => {
    return {
      IMPORTANT: {
        scope: 'meta',
        begin: '!important'
      },
      BLOCK_COMMENT: hljs.C_BLOCK_COMMENT_MODE,
      HEXCOLOR: {
        scope: 'number',
        begin: /#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/
      },
      FUNCTION_DISPATCH: {
        className: "built_in",
        begin: /[\w-]+(?=\()/
      },
      ATTRIBUTE_SELECTOR_MODE: {
        scope: 'selector-attr',
        begin: /\[/,
        end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE
        ]
      },
      CSS_NUMBER_MODE: {
        scope: 'number',
        begin: hljs.NUMBER_RE + '(' +
          '%|em|ex|ch|rem' +
          '|vw|vh|vmin|vmax' +
          '|cm|mm|in|pt|pc|px' +
          '|deg|grad|rad|turn' +
          '|s|ms' +
          '|Hz|kHz' +
          '|dpi|dpcm|dppx' +
          ')?',
        relevance: 0
      },
      CSS_VARIABLE: {
        className: "attr",
        begin: /--[A-Za-z_][A-Za-z0-9_-]*/
      }
    };
  };

  const HTML_TAGS = [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'audio',
    'b',
    'blockquote',
    'body',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'html',
    'i',
    'iframe',
    'img',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'main',
    'mark',
    'menu',
    'nav',
    'object',
    'ol',
    'p',
    'q',
    'quote',
    'samp',
    'section',
    'span',
    'strong',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'ul',
    'var',
    'video'
  ];

  const SVG_TAGS = [
    'defs',
    'g',
    'marker',
    'mask',
    'pattern',
    'svg',
    'switch',
    'symbol',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feFlood',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'linearGradient',
    'radialGradient',
    'stop',
    'circle',
    'ellipse',
    'image',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
    'text',
    'use',
    'textPath',
    'tspan',
    'foreignObject',
    'clipPath'
  ];

  const TAGS = [
    ...HTML_TAGS,
    ...SVG_TAGS,
  ];

  // Sorting, then reversing makes sure longer attributes/elements like
  // `font-weight` are matched fully instead of getting false positives on say `font`

  const MEDIA_FEATURES = [
    'any-hover',
    'any-pointer',
    'aspect-ratio',
    'color',
    'color-gamut',
    'color-index',
    'device-aspect-ratio',
    'device-height',
    'device-width',
    'display-mode',
    'forced-colors',
    'grid',
    'height',
    'hover',
    'inverted-colors',
    'monochrome',
    'orientation',
    'overflow-block',
    'overflow-inline',
    'pointer',
    'prefers-color-scheme',
    'prefers-contrast',
    'prefers-reduced-motion',
    'prefers-reduced-transparency',
    'resolution',
    'scan',
    'scripting',
    'update',
    'width',
    // TODO: find a better solution?
    'min-width',
    'max-width',
    'min-height',
    'max-height'
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
  const PSEUDO_CLASSES = [
    'active',
    'any-link',
    'blank',
    'checked',
    'current',
    'default',
    'defined',
    'dir', // dir()
    'disabled',
    'drop',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'future',
    'focus',
    'focus-visible',
    'focus-within',
    'has', // has()
    'host', // host or host()
    'host-context', // host-context()
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'is', // is()
    'lang', // lang()
    'last-child',
    'last-of-type',
    'left',
    'link',
    'local-link',
    'not', // not()
    'nth-child', // nth-child()
    'nth-col', // nth-col()
    'nth-last-child', // nth-last-child()
    'nth-last-col', // nth-last-col()
    'nth-last-of-type', //nth-last-of-type()
    'nth-of-type', //nth-of-type()
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'past',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'target-within',
    'user-invalid',
    'valid',
    'visited',
    'where' // where()
  ].sort().reverse();

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
  const PSEUDO_ELEMENTS = [
    'after',
    'backdrop',
    'before',
    'cue',
    'cue-region',
    'first-letter',
    'first-line',
    'grammar-error',
    'marker',
    'part',
    'placeholder',
    'selection',
    'slotted',
    'spelling-error'
  ].sort().reverse();

  const ATTRIBUTES = [
    'align-content',
    'align-items',
    'align-self',
    'alignment-baseline',
    'all',
    'animation',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'backface-visibility',
    'background',
    'background-attachment',
    'background-blend-mode',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
    'baseline-shift',
    'block-size',
    'border',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-end-style',
    'border-block-end-width',
    'border-block-start',
    'border-block-start-color',
    'border-block-start-style',
    'border-block-start-width',
    'border-block-style',
    'border-block-width',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-collapse',
    'border-color',
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-end-style',
    'border-inline-end-width',
    'border-inline-start',
    'border-inline-start-color',
    'border-inline-start-style',
    'border-inline-start-width',
    'border-inline-style',
    'border-inline-width',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-spacing',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'bottom',
    'box-decoration-break',
    'box-shadow',
    'box-sizing',
    'break-after',
    'break-before',
    'break-inside',
    'cx',
    'cy',
    'caption-side',
    'caret-color',
    'clear',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-profile',
    'color-rendering',
    'column-count',
    'column-fill',
    'column-gap',
    'column-rule',
    'column-rule-color',
    'column-rule-style',
    'column-rule-width',
    'column-span',
    'column-width',
    'columns',
    'contain',
    'content',
    'content-visibility',
    'counter-increment',
    'counter-reset',
    'cue',
    'cue-after',
    'cue-before',
    'cursor',
    'direction',
    'display',
    'dominant-baseline',
    'empty-cells',
    'enable-background',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-flow',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'float',
    'flow',
    'flood-color',
    'flood-opacity',
    'font',
    'font-display',
    'font-family',
    'font-feature-settings',
    'font-kerning',
    'font-language-override',
    'font-size',
    'font-size-adjust',
    'font-smoothing',
    'font-stretch',
    'font-style',
    'font-synthesis',
    'font-variant',
    'font-variant-caps',
    'font-variant-east-asian',
    'font-variant-ligatures',
    'font-variant-numeric',
    'font-variant-position',
    'font-variation-settings',
    'font-weight',
    'gap',
    'glyph-orientation-horizontal',
    'glyph-orientation-vertical',
    'grid',
    'grid-area',
    'grid-auto-columns',
    'grid-auto-flow',
    'grid-auto-rows',
    'grid-column',
    'grid-column-end',
    'grid-column-start',
    'grid-gap',
    'grid-row',
    'grid-row-end',
    'grid-row-start',
    'grid-template',
    'grid-template-areas',
    'grid-template-columns',
    'grid-template-rows',
    'hanging-punctuation',
    'height',
    'hyphens',
    'icon',
    'image-orientation',
    'image-rendering',
    'image-resolution',
    'ime-mode',
    'inline-size',
    'isolation',
    'kerning',
    'justify-content',
    'left',
    'letter-spacing',
    'lighting-color',
    'line-break',
    'line-height',
    'list-style',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'marker',
    'marker-end',
    'marker-mid',
    'marker-start',
    'mask',
    'margin',
    'margin-block',
    'margin-block-end',
    'margin-block-start',
    'margin-bottom',
    'margin-inline',
    'margin-inline-end',
    'margin-inline-start',
    'margin-left',
    'margin-right',
    'margin-top',
    'marks',
    'mask',
    'mask-border',
    'mask-border-mode',
    'mask-border-outset',
    'mask-border-repeat',
    'mask-border-slice',
    'mask-border-source',
    'mask-border-width',
    'mask-clip',
    'mask-composite',
    'mask-image',
    'mask-mode',
    'mask-origin',
    'mask-position',
    'mask-repeat',
    'mask-size',
    'mask-type',
    'max-block-size',
    'max-height',
    'max-inline-size',
    'max-width',
    'min-block-size',
    'min-height',
    'min-inline-size',
    'min-width',
    'mix-blend-mode',
    'nav-down',
    'nav-index',
    'nav-left',
    'nav-right',
    'nav-up',
    'none',
    'normal',
    'object-fit',
    'object-position',
    'opacity',
    'order',
    'orphans',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'overflow',
    'overflow-wrap',
    'overflow-x',
    'overflow-y',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
    'page-break-after',
    'page-break-before',
    'page-break-inside',
    'pause',
    'pause-after',
    'pause-before',
    'perspective',
    'perspective-origin',
    'pointer-events',
    'position',
    'quotes',
    'r',
    'resize',
    'rest',
    'rest-after',
    'rest-before',
    'right',
    'row-gap',
    'scroll-margin',
    'scroll-margin-block',
    'scroll-margin-block-end',
    'scroll-margin-block-start',
    'scroll-margin-bottom',
    'scroll-margin-inline',
    'scroll-margin-inline-end',
    'scroll-margin-inline-start',
    'scroll-margin-left',
    'scroll-margin-right',
    'scroll-margin-top',
    'scroll-padding',
    'scroll-padding-block',
    'scroll-padding-block-end',
    'scroll-padding-block-start',
    'scroll-padding-bottom',
    'scroll-padding-inline',
    'scroll-padding-inline-end',
    'scroll-padding-inline-start',
    'scroll-padding-left',
    'scroll-padding-right',
    'scroll-padding-top',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-snap-type',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'shape-image-threshold',
    'shape-margin',
    'shape-outside',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'speak',
    'speak-as',
    'src', // @font-face
    'tab-size',
    'table-layout',
    'text-anchor',
    'text-align',
    'text-align-all',
    'text-align-last',
    'text-combine-upright',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-style',
    'text-emphasis',
    'text-emphasis-color',
    'text-emphasis-position',
    'text-emphasis-style',
    'text-indent',
    'text-justify',
    'text-orientation',
    'text-overflow',
    'text-rendering',
    'text-shadow',
    'text-transform',
    'text-underline-position',
    'top',
    'transform',
    'transform-box',
    'transform-origin',
    'transform-style',
    'transition',
    'transition-delay',
    'transition-duration',
    'transition-property',
    'transition-timing-function',
    'unicode-bidi',
    'vector-effect',
    'vertical-align',
    'visibility',
    'voice-balance',
    'voice-duration',
    'voice-family',
    'voice-pitch',
    'voice-range',
    'voice-rate',
    'voice-stress',
    'voice-volume',
    'white-space',
    'widows',
    'width',
    'will-change',
    'word-break',
    'word-spacing',
    'word-wrap',
    'writing-mode',
    'x',
    'y',
    'z-index'
  ].sort().reverse();

  /*
  Language: Stylus
  Author: Bryant Williams <b.n.williams@gmail.com>
  Description: Stylus is an expressive, robust, feature-rich CSS language built for nodejs.
  Website: https://github.com/stylus/stylus
  Category: css, web
  */


  /** @type LanguageFn */
  function stylus(hljs) {
    const modes = MODES(hljs);

    const AT_MODIFIERS = "and or not only";
    const VARIABLE = {
      className: 'variable',
      begin: '\\$' + hljs.IDENT_RE
    };

    const AT_KEYWORDS = [
      'charset',
      'css',
      'debug',
      'extend',
      'font-face',
      'for',
      'import',
      'include',
      'keyframes',
      'media',
      'mixin',
      'page',
      'warn',
      'while'
    ];

    const LOOKAHEAD_TAG_END = '(?=[.\\s\\n[:,(])';

    // illegals
    const ILLEGAL = [
      '\\?',
      '(\\bReturn\\b)', // monkey
      '(\\bEnd\\b)', // monkey
      '(\\bend\\b)', // vbscript
      '(\\bdef\\b)', // gradle
      ';', // a whole lot of languages
      '#\\s', // markdown
      '\\*\\s', // markdown
      '===\\s', // markdown
      '\\|',
      '%' // prolog
    ];

    return {
      name: 'Stylus',
      aliases: [ 'styl' ],
      case_insensitive: false,
      keywords: 'if else for in',
      illegal: '(' + ILLEGAL.join('|') + ')',
      contains: [

        // strings
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,

        // comments
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,

        // hex colors
        modes.HEXCOLOR,

        // class tag
        {
          begin: '\\.[a-zA-Z][a-zA-Z0-9_-]*' + LOOKAHEAD_TAG_END,
          className: 'selector-class'
        },

        // id tag
        {
          begin: '#[a-zA-Z][a-zA-Z0-9_-]*' + LOOKAHEAD_TAG_END,
          className: 'selector-id'
        },

        // tags
        {
          begin: '\\b(' + TAGS.join('|') + ')' + LOOKAHEAD_TAG_END,
          className: 'selector-tag'
        },

        // psuedo selectors
        {
          className: 'selector-pseudo',
          begin: '&?:(' + PSEUDO_CLASSES.join('|') + ')' + LOOKAHEAD_TAG_END
        },
        {
          className: 'selector-pseudo',
          begin: '&?:(:)?(' + PSEUDO_ELEMENTS.join('|') + ')' + LOOKAHEAD_TAG_END
        },

        modes.ATTRIBUTE_SELECTOR_MODE,

        {
          className: "keyword",
          begin: /@media/,
          starts: {
            end: /[{;}]/,
            keywords: {
              $pattern: /[a-z-]+/,
              keyword: AT_MODIFIERS,
              attribute: MEDIA_FEATURES.join(" ")
            },
            contains: [ modes.CSS_NUMBER_MODE ]
          }
        },

        // @ keywords
        {
          className: 'keyword',
          begin: '\@((-(o|moz|ms|webkit)-)?(' + AT_KEYWORDS.join('|') + '))\\b'
        },

        // variables
        VARIABLE,

        // dimension
        modes.CSS_NUMBER_MODE,

        // functions
        //  - only from beginning of line + whitespace
        {
          className: 'function',
          begin: '^[a-zA-Z][a-zA-Z0-9_\-]*\\(.*\\)',
          illegal: '[\\n]',
          returnBegin: true,
          contains: [
            {
              className: 'title',
              begin: '\\b[a-zA-Z][a-zA-Z0-9_\-]*'
            },
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              contains: [
                modes.HEXCOLOR,
                VARIABLE,
                hljs.APOS_STRING_MODE,
                modes.CSS_NUMBER_MODE,
                hljs.QUOTE_STRING_MODE
              ]
            }
          ]
        },

        // css variables
        modes.CSS_VARIABLE,

        // attributes
        //  - only from beginning of line + whitespace
        //  - must have whitespace after it
        {
          className: 'attribute',
          begin: '\\b(' + ATTRIBUTES.join('|') + ')\\b',
          starts: {
            // value container
            end: /;|$/,
            contains: [
              modes.HEXCOLOR,
              VARIABLE,
              hljs.APOS_STRING_MODE,
              hljs.QUOTE_STRING_MODE,
              modes.CSS_NUMBER_MODE,
              hljs.C_BLOCK_COMMENT_MODE,
              modes.IMPORTANT,
              modes.FUNCTION_DISPATCH
            ],
            illegal: /\./,
            relevance: 0
          }
        },
        modes.FUNCTION_DISPATCH
      ]
    };
  }

  return stylus;

})();

    hljs.registerLanguage('stylus', hljsGrammar);
  })();/*! `verilog` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Verilog
  Author: Jon Evans <jon@craftyjon.com>
  Contributors: Boone Severson <boone.severson@gmail.com>
  Description: Verilog is a hardware description language used in electronic design automation to describe digital and mixed-signal systems. This highlighter supports Verilog and SystemVerilog through IEEE 1800-2012.
  Website: http://www.verilog.com
  Category: hardware
  */

  function verilog(hljs) {
    const regex = hljs.regex;
    const KEYWORDS = {
      $pattern: /\$?[\w]+(\$[\w]+)*/,
      keyword: [
        "accept_on",
        "alias",
        "always",
        "always_comb",
        "always_ff",
        "always_latch",
        "and",
        "assert",
        "assign",
        "assume",
        "automatic",
        "before",
        "begin",
        "bind",
        "bins",
        "binsof",
        "bit",
        "break",
        "buf|0",
        "bufif0",
        "bufif1",
        "byte",
        "case",
        "casex",
        "casez",
        "cell",
        "chandle",
        "checker",
        "class",
        "clocking",
        "cmos",
        "config",
        "const",
        "constraint",
        "context",
        "continue",
        "cover",
        "covergroup",
        "coverpoint",
        "cross",
        "deassign",
        "default",
        "defparam",
        "design",
        "disable",
        "dist",
        "do",
        "edge",
        "else",
        "end",
        "endcase",
        "endchecker",
        "endclass",
        "endclocking",
        "endconfig",
        "endfunction",
        "endgenerate",
        "endgroup",
        "endinterface",
        "endmodule",
        "endpackage",
        "endprimitive",
        "endprogram",
        "endproperty",
        "endspecify",
        "endsequence",
        "endtable",
        "endtask",
        "enum",
        "event",
        "eventually",
        "expect",
        "export",
        "extends",
        "extern",
        "final",
        "first_match",
        "for",
        "force",
        "foreach",
        "forever",
        "fork",
        "forkjoin",
        "function",
        "generate|5",
        "genvar",
        "global",
        "highz0",
        "highz1",
        "if",
        "iff",
        "ifnone",
        "ignore_bins",
        "illegal_bins",
        "implements",
        "implies",
        "import",
        "incdir",
        "include",
        "initial",
        "inout",
        "input",
        "inside",
        "instance",
        "int",
        "integer",
        "interconnect",
        "interface",
        "intersect",
        "join",
        "join_any",
        "join_none",
        "large",
        "let",
        "liblist",
        "library",
        "local",
        "localparam",
        "logic",
        "longint",
        "macromodule",
        "matches",
        "medium",
        "modport",
        "module",
        "nand",
        "negedge",
        "nettype",
        "new",
        "nexttime",
        "nmos",
        "nor",
        "noshowcancelled",
        "not",
        "notif0",
        "notif1",
        "or",
        "output",
        "package",
        "packed",
        "parameter",
        "pmos",
        "posedge",
        "primitive",
        "priority",
        "program",
        "property",
        "protected",
        "pull0",
        "pull1",
        "pulldown",
        "pullup",
        "pulsestyle_ondetect",
        "pulsestyle_onevent",
        "pure",
        "rand",
        "randc",
        "randcase",
        "randsequence",
        "rcmos",
        "real",
        "realtime",
        "ref",
        "reg",
        "reject_on",
        "release",
        "repeat",
        "restrict",
        "return",
        "rnmos",
        "rpmos",
        "rtran",
        "rtranif0",
        "rtranif1",
        "s_always",
        "s_eventually",
        "s_nexttime",
        "s_until",
        "s_until_with",
        "scalared",
        "sequence",
        "shortint",
        "shortreal",
        "showcancelled",
        "signed",
        "small",
        "soft",
        "solve",
        "specify",
        "specparam",
        "static",
        "string",
        "strong",
        "strong0",
        "strong1",
        "struct",
        "super",
        "supply0",
        "supply1",
        "sync_accept_on",
        "sync_reject_on",
        "table",
        "tagged",
        "task",
        "this",
        "throughout",
        "time",
        "timeprecision",
        "timeunit",
        "tran",
        "tranif0",
        "tranif1",
        "tri",
        "tri0",
        "tri1",
        "triand",
        "trior",
        "trireg",
        "type",
        "typedef",
        "union",
        "unique",
        "unique0",
        "unsigned",
        "until",
        "until_with",
        "untyped",
        "use",
        "uwire",
        "var",
        "vectored",
        "virtual",
        "void",
        "wait",
        "wait_order",
        "wand",
        "weak",
        "weak0",
        "weak1",
        "while",
        "wildcard",
        "wire",
        "with",
        "within",
        "wor",
        "xnor",
        "xor"
      ],
      literal: [ 'null' ],
      built_in: [
        "$finish",
        "$stop",
        "$exit",
        "$fatal",
        "$error",
        "$warning",
        "$info",
        "$realtime",
        "$time",
        "$printtimescale",
        "$bitstoreal",
        "$bitstoshortreal",
        "$itor",
        "$signed",
        "$cast",
        "$bits",
        "$stime",
        "$timeformat",
        "$realtobits",
        "$shortrealtobits",
        "$rtoi",
        "$unsigned",
        "$asserton",
        "$assertkill",
        "$assertpasson",
        "$assertfailon",
        "$assertnonvacuouson",
        "$assertoff",
        "$assertcontrol",
        "$assertpassoff",
        "$assertfailoff",
        "$assertvacuousoff",
        "$isunbounded",
        "$sampled",
        "$fell",
        "$changed",
        "$past_gclk",
        "$fell_gclk",
        "$changed_gclk",
        "$rising_gclk",
        "$steady_gclk",
        "$coverage_control",
        "$coverage_get",
        "$coverage_save",
        "$set_coverage_db_name",
        "$rose",
        "$stable",
        "$past",
        "$rose_gclk",
        "$stable_gclk",
        "$future_gclk",
        "$falling_gclk",
        "$changing_gclk",
        "$display",
        "$coverage_get_max",
        "$coverage_merge",
        "$get_coverage",
        "$load_coverage_db",
        "$typename",
        "$unpacked_dimensions",
        "$left",
        "$low",
        "$increment",
        "$clog2",
        "$ln",
        "$log10",
        "$exp",
        "$sqrt",
        "$pow",
        "$floor",
        "$ceil",
        "$sin",
        "$cos",
        "$tan",
        "$countbits",
        "$onehot",
        "$isunknown",
        "$fatal",
        "$warning",
        "$dimensions",
        "$right",
        "$high",
        "$size",
        "$asin",
        "$acos",
        "$atan",
        "$atan2",
        "$hypot",
        "$sinh",
        "$cosh",
        "$tanh",
        "$asinh",
        "$acosh",
        "$atanh",
        "$countones",
        "$onehot0",
        "$error",
        "$info",
        "$random",
        "$dist_chi_square",
        "$dist_erlang",
        "$dist_exponential",
        "$dist_normal",
        "$dist_poisson",
        "$dist_t",
        "$dist_uniform",
        "$q_initialize",
        "$q_remove",
        "$q_exam",
        "$async$and$array",
        "$async$nand$array",
        "$async$or$array",
        "$async$nor$array",
        "$sync$and$array",
        "$sync$nand$array",
        "$sync$or$array",
        "$sync$nor$array",
        "$q_add",
        "$q_full",
        "$psprintf",
        "$async$and$plane",
        "$async$nand$plane",
        "$async$or$plane",
        "$async$nor$plane",
        "$sync$and$plane",
        "$sync$nand$plane",
        "$sync$or$plane",
        "$sync$nor$plane",
        "$system",
        "$display",
        "$displayb",
        "$displayh",
        "$displayo",
        "$strobe",
        "$strobeb",
        "$strobeh",
        "$strobeo",
        "$write",
        "$readmemb",
        "$readmemh",
        "$writememh",
        "$value$plusargs",
        "$dumpvars",
        "$dumpon",
        "$dumplimit",
        "$dumpports",
        "$dumpportson",
        "$dumpportslimit",
        "$writeb",
        "$writeh",
        "$writeo",
        "$monitor",
        "$monitorb",
        "$monitorh",
        "$monitoro",
        "$writememb",
        "$dumpfile",
        "$dumpoff",
        "$dumpall",
        "$dumpflush",
        "$dumpportsoff",
        "$dumpportsall",
        "$dumpportsflush",
        "$fclose",
        "$fdisplay",
        "$fdisplayb",
        "$fdisplayh",
        "$fdisplayo",
        "$fstrobe",
        "$fstrobeb",
        "$fstrobeh",
        "$fstrobeo",
        "$swrite",
        "$swriteb",
        "$swriteh",
        "$swriteo",
        "$fscanf",
        "$fread",
        "$fseek",
        "$fflush",
        "$feof",
        "$fopen",
        "$fwrite",
        "$fwriteb",
        "$fwriteh",
        "$fwriteo",
        "$fmonitor",
        "$fmonitorb",
        "$fmonitorh",
        "$fmonitoro",
        "$sformat",
        "$sformatf",
        "$fgetc",
        "$ungetc",
        "$fgets",
        "$sscanf",
        "$rewind",
        "$ftell",
        "$ferror"
      ]
    };
    const BUILT_IN_CONSTANTS = [
      "__FILE__",
      "__LINE__"
    ];
    const DIRECTIVES = [
      "begin_keywords",
      "celldefine",
      "default_nettype",
      "default_decay_time",
      "default_trireg_strength",
      "define",
      "delay_mode_distributed",
      "delay_mode_path",
      "delay_mode_unit",
      "delay_mode_zero",
      "else",
      "elsif",
      "end_keywords",
      "endcelldefine",
      "endif",
      "ifdef",
      "ifndef",
      "include",
      "line",
      "nounconnected_drive",
      "pragma",
      "resetall",
      "timescale",
      "unconnected_drive",
      "undef",
      "undefineall"
    ];

    return {
      name: 'Verilog',
      aliases: [
        'v',
        'sv',
        'svh'
      ],
      case_insensitive: false,
      keywords: KEYWORDS,
      contains: [
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        {
          scope: 'number',
          contains: [ hljs.BACKSLASH_ESCAPE ],
          variants: [
            { begin: /\b((\d+'([bhodBHOD]))[0-9xzXZa-fA-F_]+)/ },
            { begin: /\B(('([bhodBHOD]))[0-9xzXZa-fA-F_]+)/ },
            { // decimal
              begin: /\b[0-9][0-9_]*/,
              relevance: 0
            }
          ]
        },
        /* parameters to instances */
        {
          scope: 'variable',
          variants: [
            { begin: '#\\((?!parameter).+\\)' },
            {
              begin: '\\.\\w+',
              relevance: 0
            }
          ]
        },
        {
          scope: 'variable.constant',
          match: regex.concat(/`/, regex.either(...BUILT_IN_CONSTANTS)),
        },
        {
          scope: 'meta',
          begin: regex.concat(/`/, regex.either(...DIRECTIVES)),
          end: /$|\/\/|\/\*/,
          returnEnd: true,
          keywords: DIRECTIVES
        }
      ]
    };
  }

  return verilog;

})();

    hljs.registerLanguage('verilog', hljsGrammar);
  })();/*! `vhdl` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: VHDL
  Author: Igor Kalnitsky <igor@kalnitsky.org>
  Contributors: Daniel C.K. Kho <daniel.kho@tauhop.com>, Guillaume Savaton <guillaume.savaton@eseo.fr>
  Description: VHDL is a hardware description language used in electronic design automation to describe digital and mixed-signal systems.
  Website: https://en.wikipedia.org/wiki/VHDL
  Category: hardware
  */

  function vhdl(hljs) {
    // Regular expression for VHDL numeric literals.

    // Decimal literal:
    const INTEGER_RE = '\\d(_|\\d)*';
    const EXPONENT_RE = '[eE][-+]?' + INTEGER_RE;
    const DECIMAL_LITERAL_RE = INTEGER_RE + '(\\.' + INTEGER_RE + ')?' + '(' + EXPONENT_RE + ')?';
    // Based literal:
    const BASED_INTEGER_RE = '\\w+';
    const BASED_LITERAL_RE = INTEGER_RE + '#' + BASED_INTEGER_RE + '(\\.' + BASED_INTEGER_RE + ')?' + '#' + '(' + EXPONENT_RE + ')?';

    const NUMBER_RE = '\\b(' + BASED_LITERAL_RE + '|' + DECIMAL_LITERAL_RE + ')';

    const KEYWORDS = [
      "abs",
      "access",
      "after",
      "alias",
      "all",
      "and",
      "architecture",
      "array",
      "assert",
      "assume",
      "assume_guarantee",
      "attribute",
      "begin",
      "block",
      "body",
      "buffer",
      "bus",
      "case",
      "component",
      "configuration",
      "constant",
      "context",
      "cover",
      "disconnect",
      "downto",
      "default",
      "else",
      "elsif",
      "end",
      "entity",
      "exit",
      "fairness",
      "file",
      "for",
      "force",
      "function",
      "generate",
      "generic",
      "group",
      "guarded",
      "if",
      "impure",
      "in",
      "inertial",
      "inout",
      "is",
      "label",
      "library",
      "linkage",
      "literal",
      "loop",
      "map",
      "mod",
      "nand",
      "new",
      "next",
      "nor",
      "not",
      "null",
      "of",
      "on",
      "open",
      "or",
      "others",
      "out",
      "package",
      "parameter",
      "port",
      "postponed",
      "procedure",
      "process",
      "property",
      "protected",
      "pure",
      "range",
      "record",
      "register",
      "reject",
      "release",
      "rem",
      "report",
      "restrict",
      "restrict_guarantee",
      "return",
      "rol",
      "ror",
      "select",
      "sequence",
      "severity",
      "shared",
      "signal",
      "sla",
      "sll",
      "sra",
      "srl",
      "strong",
      "subtype",
      "then",
      "to",
      "transport",
      "type",
      "unaffected",
      "units",
      "until",
      "use",
      "variable",
      "view",
      "vmode",
      "vprop",
      "vunit",
      "wait",
      "when",
      "while",
      "with",
      "xnor",
      "xor"
    ];
    const BUILT_INS = [
      "boolean",
      "bit",
      "character",
      "integer",
      "time",
      "delay_length",
      "natural",
      "positive",
      "string",
      "bit_vector",
      "file_open_kind",
      "file_open_status",
      "std_logic",
      "std_logic_vector",
      "unsigned",
      "signed",
      "boolean_vector",
      "integer_vector",
      "std_ulogic",
      "std_ulogic_vector",
      "unresolved_unsigned",
      "u_unsigned",
      "unresolved_signed",
      "u_signed",
      "real_vector",
      "time_vector"
    ];
    const LITERALS = [
      // severity_level
      "false",
      "true",
      "note",
      "warning",
      "error",
      "failure",
      // textio
      "line",
      "text",
      "side",
      "width"
    ];

    return {
      name: 'VHDL',
      case_insensitive: true,
      keywords: {
        keyword: KEYWORDS,
        built_in: BUILT_INS,
        literal: LITERALS
      },
      illegal: /\{/,
      contains: [
        hljs.C_BLOCK_COMMENT_MODE, // VHDL-2008 block commenting.
        hljs.COMMENT('--', '$'),
        hljs.QUOTE_STRING_MODE,
        {
          className: 'number',
          begin: NUMBER_RE,
          relevance: 0
        },
        {
          className: 'string',
          begin: '\'(U|X|0|1|Z|W|L|H|-)\'',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          className: 'symbol',
          begin: '\'[A-Za-z](_?[A-Za-z0-9])*',
          contains: [ hljs.BACKSLASH_ESCAPE ]
        }
      ]
    };
  }

  return vhdl;

})();

    hljs.registerLanguage('vhdl', hljsGrammar);
  })();/*! `vim` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: Vim Script
  Author: Jun Yang <yangjvn@126.com>
  Description: full keyword and built-in from http://vimdoc.sourceforge.net/htmldoc/
  Website: https://www.vim.org
  Category: scripting
  */

  function vim(hljs) {
    return {
      name: 'Vim Script',
      keywords: {
        $pattern: /[!#@\w]+/,
        keyword:
          // express version except: ! & * < = > !! # @ @@
          'N|0 P|0 X|0 a|0 ab abc abo al am an|0 ar arga argd arge argdo argg argl argu as au aug aun b|0 bN ba bad bd be bel bf bl bm bn bo bp br brea breaka breakd breakl bro bufdo buffers bun bw c|0 cN cNf ca cabc caddb cad caddf cal cat cb cc ccl cd ce cex cf cfir cgetb cgete cg changes chd che checkt cl cla clo cm cmapc cme cn cnew cnf cno cnorea cnoreme co col colo com comc comp con conf cope '
          + 'cp cpf cq cr cs cst cu cuna cunme cw delm deb debugg delc delf dif diffg diffo diffp diffpu diffs diffthis dig di dl dell dj dli do doautoa dp dr ds dsp e|0 ea ec echoe echoh echom echon el elsei em en endfo endf endt endw ene ex exe exi exu f|0 files filet fin fina fini fir fix fo foldc foldd folddoc foldo for fu go gr grepa gu gv ha helpf helpg helpt hi hid his ia iabc if ij il im imapc '
          + 'ime ino inorea inoreme int is isp iu iuna iunme j|0 ju k|0 keepa kee keepj lN lNf l|0 lad laddb laddf la lan lat lb lc lch lcl lcs le lefta let lex lf lfir lgetb lgete lg lgr lgrepa lh ll lla lli lmak lm lmapc lne lnew lnf ln loadk lo loc lockv lol lope lp lpf lr ls lt lu lua luad luaf lv lvimgrepa lw m|0 ma mak map mapc marks mat me menut mes mk mks mksp mkv mkvie mod mz mzf nbc nb nbs new nm nmapc nme nn nnoreme noa no noh norea noreme norm nu nun nunme ol o|0 om omapc ome on ono onoreme opt ou ounme ow p|0 '
          + 'profd prof pro promptr pc ped pe perld po popu pp pre prev ps pt ptN ptf ptj ptl ptn ptp ptr pts pu pw py3 python3 py3d py3f py pyd pyf quita qa rec red redi redr redraws reg res ret retu rew ri rightb rub rubyd rubyf rund ru rv sN san sa sal sav sb sbN sba sbf sbl sbm sbn sbp sbr scrip scripte scs se setf setg setl sf sfir sh sim sig sil sl sla sm smap smapc sme sn sni sno snor snoreme sor '
          + 'so spelld spe spelli spellr spellu spellw sp spr sre st sta startg startr star stopi stj sts sun sunm sunme sus sv sw sy synti sync tN tabN tabc tabdo tabe tabf tabfir tabl tabm tabnew '
          + 'tabn tabo tabp tabr tabs tab ta tags tc tcld tclf te tf th tj tl tm tn to tp tr try ts tu u|0 undoj undol una unh unl unlo unm unme uns up ve verb vert vim vimgrepa vi viu vie vm vmapc vme vne vn vnoreme vs vu vunme windo w|0 wN wa wh wi winc winp wn wp wq wqa ws wu wv x|0 xa xmapc xm xme xn xnoreme xu xunme y|0 z|0 ~ '
          // full version
          + 'Next Print append abbreviate abclear aboveleft all amenu anoremenu args argadd argdelete argedit argglobal arglocal argument ascii autocmd augroup aunmenu buffer bNext ball badd bdelete behave belowright bfirst blast bmodified bnext botright bprevious brewind break breakadd breakdel breaklist browse bunload '
          + 'bwipeout change cNext cNfile cabbrev cabclear caddbuffer caddexpr caddfile call catch cbuffer cclose center cexpr cfile cfirst cgetbuffer cgetexpr cgetfile chdir checkpath checktime clist clast close cmap cmapclear cmenu cnext cnewer cnfile cnoremap cnoreabbrev cnoremenu copy colder colorscheme command comclear compiler continue confirm copen cprevious cpfile cquit crewind cscope cstag cunmap '
          + 'cunabbrev cunmenu cwindow delete delmarks debug debuggreedy delcommand delfunction diffupdate diffget diffoff diffpatch diffput diffsplit digraphs display deletel djump dlist doautocmd doautoall deletep drop dsearch dsplit edit earlier echo echoerr echohl echomsg else elseif emenu endif endfor '
          + 'endfunction endtry endwhile enew execute exit exusage file filetype find finally finish first fixdel fold foldclose folddoopen folddoclosed foldopen function global goto grep grepadd gui gvim hardcopy help helpfind helpgrep helptags highlight hide history insert iabbrev iabclear ijump ilist imap '
          + 'imapclear imenu inoremap inoreabbrev inoremenu intro isearch isplit iunmap iunabbrev iunmenu join jumps keepalt keepmarks keepjumps lNext lNfile list laddexpr laddbuffer laddfile last language later lbuffer lcd lchdir lclose lcscope left leftabove lexpr lfile lfirst lgetbuffer lgetexpr lgetfile lgrep lgrepadd lhelpgrep llast llist lmake lmap lmapclear lnext lnewer lnfile lnoremap loadkeymap loadview '
          + 'lockmarks lockvar lolder lopen lprevious lpfile lrewind ltag lunmap luado luafile lvimgrep lvimgrepadd lwindow move mark make mapclear match menu menutranslate messages mkexrc mksession mkspell mkvimrc mkview mode mzscheme mzfile nbclose nbkey nbsart next nmap nmapclear nmenu nnoremap '
          + 'nnoremenu noautocmd noremap nohlsearch noreabbrev noremenu normal number nunmap nunmenu oldfiles open omap omapclear omenu only onoremap onoremenu options ounmap ounmenu ownsyntax print profdel profile promptfind promptrepl pclose pedit perl perldo pop popup ppop preserve previous psearch ptag ptNext '
          + 'ptfirst ptjump ptlast ptnext ptprevious ptrewind ptselect put pwd py3do py3file python pydo pyfile quit quitall qall read recover redo redir redraw redrawstatus registers resize retab return rewind right rightbelow ruby rubydo rubyfile rundo runtime rviminfo substitute sNext sandbox sargument sall saveas sbuffer sbNext sball sbfirst sblast sbmodified sbnext sbprevious sbrewind scriptnames scriptencoding '
          + 'scscope set setfiletype setglobal setlocal sfind sfirst shell simalt sign silent sleep slast smagic smapclear smenu snext sniff snomagic snoremap snoremenu sort source spelldump spellgood spellinfo spellrepall spellundo spellwrong split sprevious srewind stop stag startgreplace startreplace '
          + 'startinsert stopinsert stjump stselect sunhide sunmap sunmenu suspend sview swapname syntax syntime syncbind tNext tabNext tabclose tabedit tabfind tabfirst tablast tabmove tabnext tabonly tabprevious tabrewind tag tcl tcldo tclfile tearoff tfirst throw tjump tlast tmenu tnext topleft tprevious ' + 'trewind tselect tunmenu undo undojoin undolist unabbreviate unhide unlet unlockvar unmap unmenu unsilent update vglobal version verbose vertical vimgrep vimgrepadd visual viusage view vmap vmapclear vmenu vnew '
          + 'vnoremap vnoremenu vsplit vunmap vunmenu write wNext wall while winsize wincmd winpos wnext wprevious wqall wsverb wundo wviminfo xit xall xmapclear xmap xmenu xnoremap xnoremenu xunmap xunmenu yank',
        built_in: // built in func
          'synIDtrans atan2 range matcharg did_filetype asin feedkeys xor argv '
          + 'complete_check add getwinposx getqflist getwinposy screencol '
          + 'clearmatches empty extend getcmdpos mzeval garbagecollect setreg '
          + 'ceil sqrt diff_hlID inputsecret get getfperm getpid filewritable '
          + 'shiftwidth max sinh isdirectory synID system inputrestore winline '
          + 'atan visualmode inputlist tabpagewinnr round getregtype mapcheck '
          + 'hasmapto histdel argidx findfile sha256 exists toupper getcmdline '
          + 'taglist string getmatches bufnr strftime winwidth bufexists '
          + 'strtrans tabpagebuflist setcmdpos remote_read printf setloclist '
          + 'getpos getline bufwinnr float2nr len getcmdtype diff_filler luaeval '
          + 'resolve libcallnr foldclosedend reverse filter has_key bufname '
          + 'str2float strlen setline getcharmod setbufvar index searchpos '
          + 'shellescape undofile foldclosed setqflist buflisted strchars str2nr '
          + 'virtcol floor remove undotree remote_expr winheight gettabwinvar '
          + 'reltime cursor tabpagenr finddir localtime acos getloclist search '
          + 'tanh matchend rename gettabvar strdisplaywidth type abs py3eval '
          + 'setwinvar tolower wildmenumode log10 spellsuggest bufloaded '
          + 'synconcealed nextnonblank server2client complete settabwinvar '
          + 'executable input wincol setmatches getftype hlID inputsave '
          + 'searchpair or screenrow line settabvar histadd deepcopy strpart '
          + 'remote_peek and eval getftime submatch screenchar winsaveview '
          + 'matchadd mkdir screenattr getfontname libcall reltimestr getfsize '
          + 'winnr invert pow getbufline byte2line soundfold repeat fnameescape '
          + 'tagfiles sin strwidth spellbadword trunc maparg log lispindent '
          + 'hostname setpos globpath remote_foreground getchar synIDattr '
          + 'fnamemodify cscope_connection stridx winbufnr indent min '
          + 'complete_add nr2char searchpairpos inputdialog values matchlist '
          + 'items hlexists strridx browsedir expand fmod pathshorten line2byte '
          + 'argc count getwinvar glob foldtextresult getreg foreground cosh '
          + 'matchdelete has char2nr simplify histget searchdecl iconv '
          + 'winrestcmd pumvisible writefile foldlevel haslocaldir keys cos '
          + 'matchstr foldtext histnr tan tempname getcwd byteidx getbufvar '
          + 'islocked escape eventhandler remote_send serverlist winrestview '
          + 'synstack pyeval prevnonblank readfile cindent filereadable changenr '
          + 'exp'
      },
      illegal: /;/,
      contains: [
        hljs.NUMBER_MODE,
        {
          className: 'string',
          begin: '\'',
          end: '\'',
          illegal: '\\n'
        },

        /*
        A double quote can start either a string or a line comment. Strings are
        ended before the end of a line by another double quote and can contain
        escaped double-quotes and post-escaped line breaks.

        Also, any double quote at the beginning of a line is a comment but we
        don't handle that properly at the moment: any double quote inside will
        turn them into a string. Handling it properly will require a smarter
        parser.
        */
        {
          className: 'string',
          begin: /"(\\"|\n\\|[^"\n])*"/
        },
        hljs.COMMENT('"', '$'),

        {
          className: 'variable',
          begin: /[bwtglsav]:[\w\d_]+/
        },
        {
          begin: [
            /\b(?:function|function!)/,
            /\s+/,
            hljs.IDENT_RE
          ],
          className: {
            1: "keyword",
            3: "title"
          },
          end: '$',
          relevance: 0,
          contains: [
            {
              className: 'params',
              begin: '\\(',
              end: '\\)'
            }
          ]
        },
        {
          className: 'symbol',
          begin: /<[\w-]+>/
        }
      ]
    };
  }

  return vim;

})();

    hljs.registerLanguage('vim', hljsGrammar);
  })();/*! `wasm` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: WebAssembly
  Website: https://webassembly.org
  Description:  Wasm is designed as a portable compilation target for programming languages, enabling deployment on the web for client and server applications.
  Category: web, common
  Audit: 2020
  */

  /** @type LanguageFn */
  function wasm(hljs) {
    hljs.regex;
    const BLOCK_COMMENT = hljs.COMMENT(/\(;/, /;\)/);
    BLOCK_COMMENT.contains.push("self");
    const LINE_COMMENT = hljs.COMMENT(/;;/, /$/);

    const KWS = [
      "anyfunc",
      "block",
      "br",
      "br_if",
      "br_table",
      "call",
      "call_indirect",
      "data",
      "drop",
      "elem",
      "else",
      "end",
      "export",
      "func",
      "global.get",
      "global.set",
      "local.get",
      "local.set",
      "local.tee",
      "get_global",
      "get_local",
      "global",
      "if",
      "import",
      "local",
      "loop",
      "memory",
      "memory.grow",
      "memory.size",
      "module",
      "mut",
      "nop",
      "offset",
      "param",
      "result",
      "return",
      "select",
      "set_global",
      "set_local",
      "start",
      "table",
      "tee_local",
      "then",
      "type",
      "unreachable"
    ];

    const FUNCTION_REFERENCE = {
      begin: [
        /(?:func|call|call_indirect)/,
        /\s+/,
        /\$[^\s)]+/
      ],
      className: {
        1: "keyword",
        3: "title.function"
      }
    };

    const ARGUMENT = {
      className: "variable",
      begin: /\$[\w_]+/
    };

    const PARENS = {
      match: /(\((?!;)|\))+/,
      className: "punctuation",
      relevance: 0
    };

    const NUMBER = {
      className: "number",
      relevance: 0,
      // borrowed from Prism, TODO: split out into variants
      match: /[+-]?\b(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?|0x[\da-fA-F](?:_?[\da-fA-F])*(?:\.[\da-fA-F](?:_?[\da-fA-D])*)?(?:[pP][+-]?\d(?:_?\d)*)?)\b|\binf\b|\bnan(?::0x[\da-fA-F](?:_?[\da-fA-D])*)?\b/
    };

    const TYPE = {
      // look-ahead prevents us from gobbling up opcodes
      match: /(i32|i64|f32|f64)(?!\.)/,
      className: "type"
    };

    const MATH_OPERATIONS = {
      className: "keyword",
      // borrowed from Prism, TODO: split out into variants
      match: /\b(f32|f64|i32|i64)(?:\.(?:abs|add|and|ceil|clz|const|convert_[su]\/i(?:32|64)|copysign|ctz|demote\/f64|div(?:_[su])?|eqz?|extend_[su]\/i32|floor|ge(?:_[su])?|gt(?:_[su])?|le(?:_[su])?|load(?:(?:8|16|32)_[su])?|lt(?:_[su])?|max|min|mul|nearest|neg?|or|popcnt|promote\/f32|reinterpret\/[fi](?:32|64)|rem_[su]|rot[lr]|shl|shr_[su]|store(?:8|16|32)?|sqrt|sub|trunc(?:_[su]\/f(?:32|64))?|wrap\/i64|xor))\b/
    };

    const OFFSET_ALIGN = {
      match: [
        /(?:offset|align)/,
        /\s*/,
        /=/
      ],
      className: {
        1: "keyword",
        3: "operator"
      }
    };

    return {
      name: 'WebAssembly',
      keywords: {
        $pattern: /[\w.]+/,
        keyword: KWS
      },
      contains: [
        LINE_COMMENT,
        BLOCK_COMMENT,
        OFFSET_ALIGN,
        ARGUMENT,
        PARENS,
        FUNCTION_REFERENCE,
        hljs.QUOTE_STRING_MODE,
        TYPE,
        MATH_OPERATIONS,
        NUMBER
      ]
    };
  }

  return wasm;

})();

    hljs.registerLanguage('wasm', hljsGrammar);
  })();/*! `xml` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: HTML, XML
  Website: https://www.w3.org/XML/
  Category: common, web
  Audit: 2020
  */

  /** @type LanguageFn */
  function xml(hljs) {
    const regex = hljs.regex;
    // XML names can have the following additional letters: https://www.w3.org/TR/xml/#NT-NameChar
    // OTHER_NAME_CHARS = /[:\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]/;
    // Element names start with NAME_START_CHAR followed by optional other Unicode letters, ASCII digits, hyphens, underscores, and periods
    // const TAG_NAME_RE = regex.concat(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, regex.optional(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*:/), /[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*/);;
    // const XML_IDENT_RE = /[A-Z_a-z:\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]+/;
    // const TAG_NAME_RE = regex.concat(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, regex.optional(/[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*:/), /[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*/);
    // however, to cater for performance and more Unicode support rely simply on the Unicode letter class
    const TAG_NAME_RE = regex.concat(/[\p{L}_]/u, regex.optional(/[\p{L}0-9_.-]*:/u), /[\p{L}0-9_.-]*/u);
    const XML_IDENT_RE = /[\p{L}0-9._:-]+/u;
    const XML_ENTITIES = {
      className: 'symbol',
      begin: /&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/
    };
    const XML_META_KEYWORDS = {
      begin: /\s/,
      contains: [
        {
          className: 'keyword',
          begin: /#?[a-z_][a-z1-9_-]+/,
          illegal: /\n/
        }
      ]
    };
    const XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {
      begin: /\(/,
      end: /\)/
    });
    const APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, { className: 'string' });
    const QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, { className: 'string' });
    const TAG_INTERNALS = {
      endsWithParent: true,
      illegal: /</,
      relevance: 0,
      contains: [
        {
          className: 'attr',
          begin: XML_IDENT_RE,
          relevance: 0
        },
        {
          begin: /=\s*/,
          relevance: 0,
          contains: [
            {
              className: 'string',
              endsParent: true,
              variants: [
                {
                  begin: /"/,
                  end: /"/,
                  contains: [ XML_ENTITIES ]
                },
                {
                  begin: /'/,
                  end: /'/,
                  contains: [ XML_ENTITIES ]
                },
                { begin: /[^\s"'=<>`]+/ }
              ]
            }
          ]
        }
      ]
    };
    return {
      name: 'HTML, XML',
      aliases: [
        'html',
        'xhtml',
        'rss',
        'atom',
        'xjb',
        'xsd',
        'xsl',
        'plist',
        'wsf',
        'svg'
      ],
      case_insensitive: true,
      unicodeRegex: true,
      contains: [
        {
          className: 'meta',
          begin: /<![a-z]/,
          end: />/,
          relevance: 10,
          contains: [
            XML_META_KEYWORDS,
            QUOTE_META_STRING_MODE,
            APOS_META_STRING_MODE,
            XML_META_PAR_KEYWORDS,
            {
              begin: /\[/,
              end: /\]/,
              contains: [
                {
                  className: 'meta',
                  begin: /<![a-z]/,
                  end: />/,
                  contains: [
                    XML_META_KEYWORDS,
                    XML_META_PAR_KEYWORDS,
                    QUOTE_META_STRING_MODE,
                    APOS_META_STRING_MODE
                  ]
                }
              ]
            }
          ]
        },
        hljs.COMMENT(
          /<!--/,
          /-->/,
          { relevance: 10 }
        ),
        {
          begin: /<!\[CDATA\[/,
          end: /\]\]>/,
          relevance: 10
        },
        XML_ENTITIES,
        // xml processing instructions
        {
          className: 'meta',
          end: /\?>/,
          variants: [
            {
              begin: /<\?xml/,
              relevance: 10,
              contains: [
                QUOTE_META_STRING_MODE
              ]
            },
            {
              begin: /<\?[a-z][a-z0-9]+/,
            }
          ]

        },
        {
          className: 'tag',
          /*
          The lookahead pattern (?=...) ensures that 'begin' only matches
          '<style' as a single word, followed by a whitespace or an
          ending bracket.
          */
          begin: /<style(?=\s|>)/,
          end: />/,
          keywords: { name: 'style' },
          contains: [ TAG_INTERNALS ],
          starts: {
            end: /<\/style>/,
            returnEnd: true,
            subLanguage: [
              'css',
              'xml'
            ]
          }
        },
        {
          className: 'tag',
          // See the comment in the <style tag about the lookahead pattern
          begin: /<script(?=\s|>)/,
          end: />/,
          keywords: { name: 'script' },
          contains: [ TAG_INTERNALS ],
          starts: {
            end: /<\/script>/,
            returnEnd: true,
            subLanguage: [
              'javascript',
              'handlebars',
              'xml'
            ]
          }
        },
        // we need this for now for jSX
        {
          className: 'tag',
          begin: /<>|<\/>/
        },
        // open tag
        {
          className: 'tag',
          begin: regex.concat(
            /</,
            regex.lookahead(regex.concat(
              TAG_NAME_RE,
              // <tag/>
              // <tag>
              // <tag ...
              regex.either(/\/>/, />/, /\s/)
            ))
          ),
          end: /\/?>/,
          contains: [
            {
              className: 'name',
              begin: TAG_NAME_RE,
              relevance: 0,
              starts: TAG_INTERNALS
            }
          ]
        },
        // close tag
        {
          className: 'tag',
          begin: regex.concat(
            /<\//,
            regex.lookahead(regex.concat(
              TAG_NAME_RE, />/
            ))
          ),
          contains: [
            {
              className: 'name',
              begin: TAG_NAME_RE,
              relevance: 0
            },
            {
              begin: />/,
              relevance: 0,
              endsParent: true
            }
          ]
        }
      ]
    };
  }

  return xml;

})();

    hljs.registerLanguage('xml', hljsGrammar);
  })();/*! `yaml` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
  Language: YAML
  Description: Yet Another Markdown Language
  Author: Stefan Wienert <stwienert@gmail.com>
  Contributors: Carl Baxter <carl@cbax.tech>
  Requires: ruby.js
  Website: https://yaml.org
  Category: common, config
  */
  function yaml(hljs) {
    const LITERALS = 'true false yes no null';

    // YAML spec allows non-reserved URI characters in tags.
    const URI_CHARACTERS = '[\\w#;/?:@&=+$,.~*\'()[\\]]+';

    // Define keys as starting with a word character
    // ...containing word chars, spaces, colons, forward-slashes, hyphens and periods
    // ...and ending with a colon followed immediately by a space, tab or newline.
    // The YAML spec allows for much more than this, but this covers most use-cases.
    const KEY = {
      className: 'attr',
      variants: [
        // added brackets support 
        { begin: /\w[\w :()\./-]*:(?=[ \t]|$)/ },
        { // double quoted keys - with brackets
          begin: /"\w[\w :()\./-]*":(?=[ \t]|$)/ },
        { // single quoted keys - with brackets
          begin: /'\w[\w :()\./-]*':(?=[ \t]|$)/ },
      ]
    };

    const TEMPLATE_VARIABLES = {
      className: 'template-variable',
      variants: [
        { // jinja templates Ansible
          begin: /\{\{/,
          end: /\}\}/
        },
        { // Ruby i18n
          begin: /%\{/,
          end: /\}/
        }
      ]
    };
    const STRING = {
      className: 'string',
      relevance: 0,
      variants: [
        {
          begin: /'/,
          end: /'/
        },
        {
          begin: /"/,
          end: /"/
        },
        { begin: /\S+/ }
      ],
      contains: [
        hljs.BACKSLASH_ESCAPE,
        TEMPLATE_VARIABLES
      ]
    };

    // Strings inside of value containers (objects) can't contain braces,
    // brackets, or commas
    const CONTAINER_STRING = hljs.inherit(STRING, { variants: [
      {
        begin: /'/,
        end: /'/
      },
      {
        begin: /"/,
        end: /"/
      },
      { begin: /[^\s,{}[\]]+/ }
    ] });

    const DATE_RE = '[0-9]{4}(-[0-9][0-9]){0,2}';
    const TIME_RE = '([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?';
    const FRACTION_RE = '(\\.[0-9]*)?';
    const ZONE_RE = '([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?';
    const TIMESTAMP = {
      className: 'number',
      begin: '\\b' + DATE_RE + TIME_RE + FRACTION_RE + ZONE_RE + '\\b'
    };

    const VALUE_CONTAINER = {
      end: ',',
      endsWithParent: true,
      excludeEnd: true,
      keywords: LITERALS,
      relevance: 0
    };
    const OBJECT = {
      begin: /\{/,
      end: /\}/,
      contains: [ VALUE_CONTAINER ],
      illegal: '\\n',
      relevance: 0
    };
    const ARRAY = {
      begin: '\\[',
      end: '\\]',
      contains: [ VALUE_CONTAINER ],
      illegal: '\\n',
      relevance: 0
    };

    const MODES = [
      KEY,
      {
        className: 'meta',
        begin: '^---\\s*$',
        relevance: 10
      },
      { // multi line string
        // Blocks start with a | or > followed by a newline
        //
        // Indentation of subsequent lines must be the same to
        // be considered part of the block
        className: 'string',
        begin: '[\\|>]([1-9]?[+-])?[ ]*\\n( +)[^ ][^\\n]*\\n(\\2[^\\n]+\\n?)*'
      },
      { // Ruby/Rails erb
        begin: '<%[%=-]?',
        end: '[%-]?%>',
        subLanguage: 'ruby',
        excludeBegin: true,
        excludeEnd: true,
        relevance: 0
      },
      { // named tags
        className: 'type',
        begin: '!\\w+!' + URI_CHARACTERS
      },
      // https://yaml.org/spec/1.2/spec.html#id2784064
      { // verbatim tags
        className: 'type',
        begin: '!<' + URI_CHARACTERS + ">"
      },
      { // primary tags
        className: 'type',
        begin: '!' + URI_CHARACTERS
      },
      { // secondary tags
        className: 'type',
        begin: '!!' + URI_CHARACTERS
      },
      { // fragment id &ref
        className: 'meta',
        begin: '&' + hljs.UNDERSCORE_IDENT_RE + '$'
      },
      { // fragment reference *ref
        className: 'meta',
        begin: '\\*' + hljs.UNDERSCORE_IDENT_RE + '$'
      },
      { // array listing
        className: 'bullet',
        // TODO: remove |$ hack when we have proper look-ahead support
        begin: '-(?=[ ]|$)',
        relevance: 0
      },
      hljs.HASH_COMMENT_MODE,
      {
        beginKeywords: LITERALS,
        keywords: { literal: LITERALS }
      },
      TIMESTAMP,
      // numbers are any valid C-style number that
      // sit isolated from other words
      {
        className: 'number',
        begin: hljs.C_NUMBER_RE + '\\b',
        relevance: 0
      },
      OBJECT,
      ARRAY,
      STRING
    ];

    const VALUE_MODES = [ ...MODES ];
    VALUE_MODES.pop();
    VALUE_MODES.push(CONTAINER_STRING);
    VALUE_CONTAINER.contains = VALUE_MODES;

    return {
      name: 'YAML',
      case_insensitive: true,
      aliases: [ 'yml' ],
      contains: MODES
    };
  }

  return yaml;

})();

    hljs.registerLanguage('yaml', hljsGrammar);
  })();/*! `zephir` grammar compiled for Highlight.js 11.9.0 */
  (function(){
    var hljsGrammar = (function () {
  'use strict';

  /*
   Language: Zephir
   Description: Zephir, an open source, high-level language designed to ease the creation and maintainability of extensions for PHP with a focus on type and memory safety.
   Author: Oleg Efimov <efimovov@gmail.com>
   Website: https://zephir-lang.com/en
   Category: web
   Audit: 2020
   */

  /** @type LanguageFn */
  function zephir(hljs) {
    const STRING = {
      className: 'string',
      contains: [ hljs.BACKSLASH_ESCAPE ],
      variants: [
        hljs.inherit(hljs.APOS_STRING_MODE, { illegal: null }),
        hljs.inherit(hljs.QUOTE_STRING_MODE, { illegal: null })
      ]
    };
    const TITLE_MODE = hljs.UNDERSCORE_TITLE_MODE;
    const NUMBER = { variants: [
      hljs.BINARY_NUMBER_MODE,
      hljs.C_NUMBER_MODE
    ] };
    const KEYWORDS =
      // classes and objects
      'namespace class interface use extends '
      + 'function return '
      + 'abstract final public protected private static deprecated '
      // error handling
      + 'throw try catch Exception '
      // keyword-ish things their website does NOT seem to highlight (in their own snippets)
      // 'typeof fetch in ' +
      // operators/helpers
      + 'echo empty isset instanceof unset '
      // assignment/variables
      + 'let var new const self '
      // control
      + 'require '
      + 'if else elseif switch case default '
      + 'do while loop for continue break '
      + 'likely unlikely '
      // magic constants
      // https://github.com/phalcon/zephir/blob/master/Library/Expression/Constants.php
      + '__LINE__ __FILE__ __DIR__ __FUNCTION__ __CLASS__ __TRAIT__ __METHOD__ __NAMESPACE__ '
      // types - https://docs.zephir-lang.com/0.12/en/types
      + 'array boolean float double integer object resource string '
      + 'char long unsigned bool int uint ulong uchar '
      // built-ins
      + 'true false null undefined';

    return {
      name: 'Zephir',
      aliases: [ 'zep' ],
      keywords: KEYWORDS,
      contains: [
        hljs.C_LINE_COMMENT_MODE,
        hljs.COMMENT(
          /\/\*/,
          /\*\//,
          { contains: [
            {
              className: 'doctag',
              begin: /@[A-Za-z]+/
            }
          ] }
        ),
        {
          className: 'string',
          begin: /<<<['"]?\w+['"]?$/,
          end: /^\w+;/,
          contains: [ hljs.BACKSLASH_ESCAPE ]
        },
        {
          // swallow composed identifiers to avoid parsing them as keywords
          begin: /(::|->)+[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/ },
        {
          className: 'function',
          beginKeywords: 'function fn',
          end: /[;{]/,
          excludeEnd: true,
          illegal: /\$|\[|%/,
          contains: [
            TITLE_MODE,
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              keywords: KEYWORDS,
              contains: [
                'self',
                hljs.C_BLOCK_COMMENT_MODE,
                STRING,
                NUMBER
              ]
            }
          ]
        },
        {
          className: 'class',
          beginKeywords: 'class interface',
          end: /\{/,
          excludeEnd: true,
          illegal: /[:($"]/,
          contains: [
            { beginKeywords: 'extends implements' },
            TITLE_MODE
          ]
        },
        {
          beginKeywords: 'namespace',
          end: /;/,
          illegal: /[.']/,
          contains: [ TITLE_MODE ]
        },
        {
          beginKeywords: 'use',
          end: /;/,
          contains: [ TITLE_MODE ]
        },
        { begin: /=>/ // No markup, just a relevance booster
        },
        STRING,
        NUMBER
      ]
    };
  }

  return zephir;

})();

    hljs.registerLanguage('zephir', hljsGrammar);
  })();