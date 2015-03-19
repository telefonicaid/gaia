
/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.14 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.14',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i == 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("../bower_components/requirejs/index", function(){});

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define('debug',[],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.debug=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = _dereq_('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors and the Firebug
 * extension (*not* the built-in Firefox web inpector) are
 * known to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table)));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? '%c ' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args

  var c = 'color: ' + this.color;
  args = [args[0], c, ''].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // This hackery is required for IE8,
  // where the `console.log` function doesn't have 'apply'
  return 'object' == typeof console
    && 'function' == typeof console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      localStorage.removeItem('debug');
    } else {
      localStorage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = localStorage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

},{"./debug":2}],2:[function(_dereq_,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = _dereq_('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = exports.log || enabled.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace('*', '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":3}],3:[function(_dereq_,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}]},{},[1])
(1)
});
define('lib/setting-alias',['require','exports','module','debug'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('setting-alias');

/**
 * Locals
 */

var forwardMethods = [
  'filterOptions',
  'resetOptions',
  'supported',
  'selected',
  'select',
  'next',
  'get',
  'set'
];

/**
 * Exports
 */

module.exports = SettingAlias;

/**
 * Initialize a new `SettingsAlias`
 *
 * SettingsAlias's are kinda confusing,
 * but they simplify our app code massively
 * in the long run.
 *
 * A `SettingAlias` has the same API as a `Setting`
 * but behind the scenes provides a single interface
 * to several `Setting`s. Depending on the state
 * of the app, the `SettingAlias` will point to
 * a different settings instance.
 *
 * Example:
 *
 *    var flashModesPicture = new Setting({ key: 'flashModesPicture' });
 *    var flashModesVideo = new Setting({ key: 'flashModesVideo' });
 *    var mode = 'picture';
 *
 *    var flashModes = new SettingAlias({
 *      key: 'flashModes',
 *      settings: {
 *        'picture': flashModesPicture,
 *        'video': flashModesVideo
 *      },
 *      get: function() {
 *        return this.settings[mode];
 *      }
 *    });
 *
 *    flashModes.get('key'); //=> 'flashModesPicture'
 *    mode = 'video';
 *    flashModes.get('key'); //=> 'flashModesVideo'
 *
 * This means our app can simply call API on
 * `flashModes` setting-alias and not worry
 * about which 'mode' the app is in.
 *
 * Options:
 *
 *   - `key` The name of the setting-alias
 *   - `settings` Hash of possible `Setting`s
 *   - `get` Method that returns the current `Setting`
 *
 * @param {Object} options
 */
function SettingAlias(options) {
  debug('initialize');
  this.key = options.key;
  this.settings = options.settings;
  this.current = options.get.bind(this);
  forwardMethods.forEach(this.forward, this);
  debug('initialized');
}

/**
 * Iterates over each setting.
 *
 * @param  {Function} fn
 * @private
 */
SettingAlias.prototype.each = function(fn) {
  for (var key in this.settings) {
    fn(this.settings[key]);
  }
};

/**
 * States whether the passed key
 * is the currently active setting.
 *
 * @param  {String}  key
 * @return {Boolean}
 */
SettingAlias.prototype.is = function(key) {
  return this.get('key') === key;
};

/**
 * Attaches a method that forwards
 * the call onto the current
 * matching setting.
 *
 * @param  {String} method
 */
SettingAlias.prototype.forward = function(method) {
  this[method] = function() {
    var setting = this.current();
    return setting[method].apply(setting, arguments);
  };
};

/**
 * Add an event callback.
 *
 * The callback is wrapped in
 * a function that first checks that
 * the setting is the active setting
 * before calling the original callback.
 *
 * @param  {String}   name
 * @param  {Function} fn
 */
SettingAlias.prototype.on = function(name, fn) {
  var alias = this;
  var wrapped = function() {
    if (!alias.is(this.key)) { return; }
    fn.apply(this, arguments);
  };

  this.each(function(setting) { setting.on(name, wrapped); });
  fn._settingAliasCallback = wrapped;
};

/**
 * Remove an event callback.
 *
 * @param  {String}   name
 * @param  {Function} fn
 */
SettingAlias.prototype.off = function(name, fn) {
  var wrapped = fn._settingAliasCallback;
  this.each(function(setting) { setting.off(name, wrapped); });
  delete fn._settingAliasCallback;
};

});


/**
 * Evt
 *
 * A super lightweight
 * event emitter library.
 *
 * @version 0.3.3
 * @author Wilson Page <wilson.page@me.com>
 */

;(function() {

/**
 * Locals
 */

var proto = Events.prototype;
var slice = [].slice;

/**
 * Creates a new event emitter
 * instance, or if passed an
 * object, mixes the event logic
 * into it.
 *
 * @param  {Object} obj
 * @return {Object}
 */
function Events(obj) {
  if (!(this instanceof Events)) return new Events(obj);
  if (obj) return mixin(obj, proto);
}

/**
 * Registers a callback
 * with an event name.
 *
 * @param  {String}   name
 * @param  {Function} cb
 * @return {Event}
 */
proto.on = function(name, cb) {
  this._cbs = this._cbs || {};
  (this._cbs[name] || (this._cbs[name] = [])).push(cb);
  return this;
};

/**
 * Attach a callback that once
 * called, detaches itself.
 *
 * TODO: Implement `.off()` to work
 * with `once()` callbacks.
 *
 * @param  {String}   name
 * @param  {Function} cb
 * @public
 */
proto.once = function(name, cb) {
  this.on(name, one);
  function one() {
    cb.apply(this, arguments);
    this.off(name, one);
  }
};

/**
 * Removes a single callback,
 * or all callbacks associated
 * with the passed event name.
 *
 * @param  {String}   name
 * @param  {Function} cb
 * @return {Event}
 */
proto.off = function(name, cb) {
  this._cbs = this._cbs || {};

  if (!name) { this._cbs = {}; return; }
  if (!cb) { return delete this._cbs[name]; }

  var cbs = this._cbs[name] || [];
  var i;

  while (cbs && ~(i = cbs.indexOf(cb))) { cbs.splice(i, 1); }
  return this;
};

/**
 * Fires an event, triggering
 * all callbacks registered on this
 * event name.
 *
 * @param  {String} name
 * @return {Event}
 */
proto.fire = proto.emit = function(options) {
  var cbs = this._cbs = this._cbs || {};
  var name = options.name || options;
  var batch = (cbs[name] || []).concat(cbs['*'] || []);
  var ctx = options.ctx || this;

  if (batch.length) {
    this._fireArgs = arguments;
    var args = slice.call(arguments, 1);
    while (batch.length) {
      batch.shift().apply(ctx, args);
    }
  }

  return this;
};

proto.firer = function(name) {
  var self = this;
  return function() {
    var args = slice.call(arguments);
    args.unshift(name);
    self.fire.apply(self, args);
  };
};

/**
 * Util
 */

/**
 * Mixes in the properties
 * of the second object into
 * the first.
 *
 * @param  {Object} a
 * @param  {Object} b
 * @return {Object}
 */
function mixin(a, b) {
  for (var key in b) a[key] = b[key];
  return a;
}

/**
 * Expose 'Event' (UMD)
 */

if (typeof exports === 'object') {
  module.exports = Events;
} else if (typeof define === 'function' && define.amd) {
  define('evt',[],function(){ return Events; });
} else {
  window.evt = Events;
}

})();
(function(define){define('model',['require','exports','module','evt'],function(require,exports,module){


/**
 * Dependencies
 */

var events = require('evt');

/**
 * Exports
 */

module.exports = Model;

function Model(obj) {
  if (!(this instanceof Model)) { return mix(obj, Model.prototype); }
  this.reset(obj, { silent: true });
  this.id = obj.id || obj.key;
}

Model.prototype = events({

  /**
   * Returns the value of the given
   * key, or if not key is given a
   * shallow clone of the model is
   * returned.
   *
   * We check `aguments.length` so that
   * when calling `get()` with an unknown
   * key, `undefined` is returned and not
   * the entire model.
   *
   * Example:
   *
   *   model.get(); //=> { ... }
   *   model.get('undefinedKey'); //=> undefined
   *
   * @param  {String} key
   * @return {*}
   * @public
   */
  get: function(key) {
    var data = this._getData();
    return arguments.length ? data[key] : mix({}, data);
  },

  set: function(key, value, options) {
    options = typeof key === 'object' ? value : options;
    var silent = options && options.silent;
    var data = this._getData();
    var keys;

    switch (typeof key) {
      case 'string':
        data[key] = value;
        if (!silent) {
          this.onKeyChange(key);
          this.emit('change', [key]);
        }
        return;
      case 'object':
        mix(data, key);
        if (!silent) {
          keys = Object.keys(key);
          keys.forEach(this.onKeyChange, this);
          this.emit('change', keys);
        }
        return;
    }
  },

  setter: function(key, value1) {
    return (function(value2) { this.set(key, value1 || value2); }).bind(this);
  },

  reset: function(data, options) {
    if (!data) { return; }
    var silent = options && options.silent;
    var isArray = data instanceof Array;
    this._data = !isArray ? mix({}, data) : data;
    if (!silent) { this.emit('reset'); }
  },

  onKeyChange: function(key) {
    var data = this._getData();
    this.emit('change:' + key, data[key]);
  },

  _getData: function() {
    this._data = this._data || {};
    return this._data;
  }
});

function mix(a, b) {
  for (var key in b) { a[key] = b[key]; }
  return a;
}

});})((function(n,w){return typeof define=='function'&&define.amd?
define:typeof module=='object'?function(c){c(require,exports,module);}:function(c){
var m={exports:{}},r=function(n){return w[n];};w[n]=c(r,m.exports,m)||m.exports;};})('model',this));
define('lib/setting',['require','exports','module','debug','model'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('setting');
var model = require('model');

/**
 * Exports
 */

module.exports = Setting;

/**
 * Mixin `Model` methods
 */

model(Setting.prototype);

/**
 * Initialize a new `Setting`.
 *
 * @param {Object} data
 */
function Setting(data) {
  this.key = data.key;
  this.storage = data.storage || localStorage;
  this.reset(data, { silent: true });
  this.select = this.select.bind(this);
  this.next = this.next.bind(this);
  this.configure(data);
  if (data.persistent) { this.on('change:selected', this.save); }
}

Setting.prototype.configure = function(data) {
  var optionsDefined = !!(data.options && data.options.length);
  this.options = { defined: optionsDefined };
  this.resetOptions(data.options);
};

Setting.prototype.resetOptions = function(list) {
  list = list || [];

  var hash = this.optionsToHash(list);
  this.options.all = hash;
  this.options.available = hash;

  this.set('options', list, { silent: true });
  this.updateSelected({ silent: true });
};

Setting.prototype.filterOptions = function(keys, options) {
  var available = this.options.available = {};
  var hash = this.options.all;
  var filtered = [];

  (keys || []).forEach(function(key) {
    var option = hash[key];
    if (option !== undefined) {
      filtered.push(option);
      available[key] = option;
    }
  });

  this.sortByIndex(filtered);
  this.set('options', filtered, options);
  this.updateSelected({ silent: true });
};

/**
 * Convert this Setting's `options` array as defined
 * in config/app.js into an object as key/value pairs.
 * This allows us to look up an option by its `key`.
 *
 * e.g.: [ { key: 'a', title: 'A' }, ... ] ->
 *       { a: { key: 'a', title: 'A' }, ... }
 *
 * We use this hash to validate
 * incoming options and ot mixin
 * config data with dynamic options.
 *
 * @param  {Array} options
 * @return {undefined|Object}
 */
Setting.prototype.optionsToHash = function(options) {
  var hash = {};
  options.forEach(function(option, index) {
    option.index = index;
    hash[option.key] = option;
  });
  return hash;
};

/**
 * Get the selected option,
 * or just a particular key
 * if given.
 *
 * @param  {String} key
 * @return {Object|*}
 */
Setting.prototype.selected = function(key) {
  var hash = this.options.available;
  var option = hash[this.get('selected')];
  return key ? option && option[key] : option;
};

/**
 * Select an option.
 *
 * Accepts an string key to select,
 * or an integer index relating to
 * the current options list.
 *
 * Options:
 *
 *  - {Boolean} silent
 *
 * @param {String|Number} key
 * @param {Object} opts  Model#set() options
 */
Setting.prototype.select = function(key, options) {
  var isIndex = typeof key === 'number';
  var list = this.get('options');
  var available = this.options.available;
  var selected = isIndex ? list[key] : available[key];

  // If there are no options, exit
  if (!list.length) { return; }

  // If an option was not found,
  // default to selecting the first.
  if (!selected) { return this.select(0, options); }

  // Store the new choice
  this.set('selected', selected.key, options);
};

/**
 * Sorts the current options list
 * by their originally defined
 * index in the config JSON.
 *
 * @private
 */
Setting.prototype.sortByIndex = function(list) {
  return list.sort(function(a, b) { return a.index - b.index; });
};

/**
 * Silently updates the `selected`
 * property of the Setting.
 *
 * If no selected key is present
 * we attempt to select the last
 * fetched persited selection.
 *
 * @private
 */
Setting.prototype.updateSelected = function(options) {
  this.select(this.get('selected') || this.fetched, options);
};

/**
 * Set the `selected` option to
 * the next option in the list.
 *
 * First option is chosen if
 * there is no next option.
 *
 * @public
 */
Setting.prototype.next = function() {
  var options = this.get('options');
  var selected = this.selected();
  var index = options.indexOf(selected);
  var newIndex = (index + 1) % options.length;
  this.select(newIndex);
  debug('set \'%s\' to index: %s', this.key, newIndex);
};

/**
 * Persists the current selection
 * to storage for retreval in the
 * next session.
 *
 * We're using localStorage as performance
 * vastly outweighed indexedBD (asyncStorage)
 * by 1ms/500ms on Hamachi device.
 *
 * @public
 */
Setting.prototype.save = function() {
  var selected = this.get('selected');
  debug('saving key: %s, selected: %s', this.key, selected);
  this.storage.setItem('setting:' + this.key, selected);
  debug('saved key: %s', selected);
};

/**
 * Fetches the persisted selection
 * from storage, updating the
 * `selected` key.
 *
 * We're using localStorage, as performance
 * vastly outweighed indexedBD (asyncStorage)
 * by 1ms/500ms on Hamachi device.
 *
 * Leaving in the `done` callback in-case
 * storage goes async again in future.
 *
 * @param  {Function} done
 * @public
 */
Setting.prototype.fetch = function() {
  if (!this.get('persistent')) { return; }
  debug('fetch value key: %s', this.key);
  this.fetched = this.storage.getItem('setting:' + this.key);
  debug('fetched %s value: %s', this.key, this.fetched);
  if (this.fetched) { this.select(this.fetched, { silent: true }); }
};

/**
 * States whether this setting
 * is currently supported.
 *
 * 'Supported' means, it's not been
 * disabled, and there are options
 * to be chosen from.
 *
 * @return {Boolean}
 */
Setting.prototype.supported = function() {
  return this.enabled() && !!this.get('options').length;
};


/**
 * Check if this setting is not
 * marked as disabled.
 *
 * @return {Boolean}
 */
Setting.prototype.enabled = function() {
  return !this.get('disabled');
};

});

define('lib/settings',['require','exports','module','./setting-alias','debug','./setting'],function(require, exports, module) {


/**
 * Dependencies
 */

var SettingAlias = require('./setting-alias');
var debug = require('debug')('settings');
var Setting = require('./setting');

/**
 * Exports
 */

module.exports = Settings;

/**
 * Initialize a new 'Setting'
 *
 * @param {Object} items
 */
function Settings(items) {
  this.ids = {};
  this.items = [];
  this.aliases = {};
  this.SettingAlias = SettingAlias; // Test hook
  this.dontSave = this.dontSave.bind(this);
  this.addEach(items);
}

/**
 * Add several Settings in one go.
 *
 * @param {Object} items
 */
Settings.prototype.addEach = function(items) {
  if (!items) { return; }
  var item;
  var key;

  for (key in items) {
    item = items[key];
    item.key = item.key || key;
    this.add(items[key]);
  }
};

/**
 * Add a new Setting to the settings collection.
 *
 * @param {Object} data
 */
Settings.prototype.add = function(data) {
  var setting = new Setting(data);
  this.items.push(setting);
  this.ids[setting.key] = this[setting.key] = setting;
  debug('added setting: %s', setting.key);
};

/**
 * Fetch all the Settings previous
 * state from storage.
 *
 * @public
 */
Settings.prototype.fetch = function() {
  this.items.forEach(function(setting) { setting.fetch(); });
};

/**
 * Prevent all settings from saving
 * when they are changed.
 *
 * This is used in activity sessions
 * whereby we don't want any settings
 * changes to persist to future camera
 * sessions.
 *
 * @public
 */
Settings.prototype.dontSave = function() {
  this.items.forEach(function(setting) {
    setting.off('change:selected', setting.save);
  });
};

/**
 * Add a SettingAlias to the settings.
 * (see lib/setting-alias.js for more info)
 *
 * @param  {Object} options
 * @public
 */
Settings.prototype.alias = function(options) {
  var alias = new this.SettingAlias(options);
  this.aliases[options.key] = alias;
  this[options.key] = alias;
};

Settings.prototype.removeAlias = function(key) {
  // TODO: Implement
};

});

define('lib/geo-location',['require','exports','module','debug'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('geolocation');

/**
 * Locals
 */

var geolocation = navigator.geolocation;

/**
 * Exports
 */

module.exports = GeoLocation;

/**
 * Interface to the
 * geolocation API.
 *
 * @constructor
 */
function GeoLocation() {
  this.watcher = null;
  this.position = null;
  this.setPosition = this.setPosition.bind(this);
  this.watch = this.watch.bind(this);
}

/**
 * Watches device location.
 *
 * @public
 */
GeoLocation.prototype.watch = function() {
  if (!this.watcher) {
    this.watcher = geolocation.watchPosition(this.setPosition);
    debug('started watching');
  }
};

/**
 * Stops watching
 * device location.
 *
 * @public
 */
GeoLocation.prototype.stopWatching = function() {
  geolocation.clearWatch(this.watcher);
  this.watcher = null;
  debug('stopped watching');
};

/**
 * Updates the stored
 * position object.
 *
 * @private
 */
GeoLocation.prototype.setPosition = function(position) {
  this.position = {
    timestamp: position.timestamp,
    altitude: position.coords.altitude,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
};

});

define('config/config',['require','exports','module'],function(require, exports, module) {


module.exports = {
  // This remaining globals are required by external dependencies of camera.
  // shared/js/media/jpeg_metadata_parser.js
  // shared/js/media/media_frame.js
  globals : {
    // The maximum picture size that camera is allowed to take
    CONFIG_MAX_IMAGE_PIXEL_SIZE: 24 * 1024 * 1024,
    CONFIG_MAX_SNAPSHOT_PIXEL_SIZE: 24 * 1024 * 1024,

    // Size of the exif preview embeded in images taken by camera
    CONFIG_REQUIRED_EXIF_PREVIEW_WIDTH: 0,
    CONFIG_REQUIRED_EXIF_PREVIEW_HEIGHT: 0
  },

  zoom: {
    disabled: false,

    // The viewfinder preview stream should automatically
    // reflect the current zoom value. However, on some
    // devices, the viewfinder needs to be scaled by the
    // application. Set this flag if the preview stream
    // does not visually reflect the zoom value properly.
    useZoomPreviewAdjustment: false
  },

  focus: {
    // Set this properties to false if you
    // want to disable focus modes
    // even on hardware that supports them
    // -----------------------------------
    // The camera will be continously focusing
    // on a point of the scene. It is the center of the image
    // unless touch to focus is enabled and the user selects a
    // different region.
    continuousAutoFocus: true,
    // The user can select the area of the image
    // where the camera is going to try to focus the scene.
    touchFocus: true,
    // The camera detects faces and tries to focus
    // on them.
    faceDetection: true
  },

  previewGallery: {
    // Dimensions for thumbnail image (will automatically be
    // multiplied by the devicePixelRatio)
    thumbnailWidth: 54,
    thumbnailHeight: 54
  },

  viewfinder: {
    scaleType: 'fill',
    // Used to adjust sensitivity for pinch-to-zoom gesture
    // (smaller values = more sensitivity)
    zoomGestureSensitivity: 0.425
  },

  battery: {
    levels: {
      low: 15,
      verylow: 10,
      critical: 6,
      shutdown: 5,
      healthy: 100
    }
  },

  sounds: {
    list: [
      {
        name: 'shutter',
        url: './resources/sounds/shutter.opus',
        setting: 'camera.sound.enabled'
      },
      {
        name: 'timer',
        url: './resources/sounds/timer.opus',
        setting: 'camera.sound.enabled'
      },
      {
        name: 'recordingStart',
        url: './resources/sounds/camcorder_start.opus',
        setting: 'camera.sound.enabled'
      },
      {
        name: 'recordingEnd',
        url: './resources/sounds/camcorder_end.opus',
        setting: 'camera.sound.enabled'
      }
    ]
  },

  keyDownEvents: {
    camera: 'capture',
    volumeup: 'capture',
    volumedown: 'capture',
    mozcamerafocusadjust: 'focus',
  },

  activity: {

    // The amount to scale pixelSize derived from
    // 'pick' activities that define `width` or `height`
    // parameters. The larger the scale factor, the larger
    // the activity `maxPixelSize` icreasing the probability
    // that a larger pictureSize will be chosen for the activity.
    maxPixelSizeScaleFactor: 2.5,

    // Reduce the size of images returned by pick activities.
    // A pick activity can specify its own maximum size. However,
    // this setting can lower that pixel size limitation even
    // further. To prevent further limiting the pixel size for
    // pick activities, set this value to `0`.
    // (useful for devices with limited memory)
    maxPickPixelSize: 0,

    // Reduce the size of images returned by share activities.
    // To prevent resizing images that are shared, set this
    // value to `0`.
    // (useful for devices with limited memory)
    maxSharePixelSize: 0
  },

  spinnerTimeouts: {
    takingPicture: 1650,
    requestingCamera: 850,
    loadingVideo: 100
  },

  mode: {
    options: [
      {
        key: 'picture'
      },
      {
        key: 'video'
      }
    ],
    persistent: false
  },

  isoModes: {
    disabled: false,
    options: [
      {
        key: 'auto'
      }
    ],
    selected:'auto'
  },

  whiteBalance: {
    disabled: false,
    options: [
      {
        key: 'auto'
      }
    ],
    selected:'auto'
  },

  cameras: {
    options: [
      {
        key: 'back',
        icon: 'toggle-camera-rear',
        title: 'toggle-camera-rear'
      },
      {
        key: 'front',
        icon: 'toggle-camera-front',
        title: 'toggle-camera-front'
      }
    ],
    persistent: false
  },

  pictureSizesFront: {
    title: 'camera-resolution',
    header: 'camera-resolution-header',
    icon: 'picture-size',
    options: [
      // {
      //   key: '2048x1536'
      // }
    ],
    exclude: {
      aspects: ['5:3', '11:9', '16:9']
    },
    persistent: true,
    optionsLocalizable: false,
  },

  pictureSizesBack: {
    title: 'camera-resolution',
    header: 'camera-resolution-header',
    icon: 'picture-size',
    options: [
      // {
      //   key: '2048x1536'
      // }
    ],
    exclude: {
      keys: ['1920x1088'],
      aspects: ['5:3', '11:9', '16:9'],
    },
    persistent: true,
    optionsLocalizable: false,
  },

  recorderProfilesBack: {
    title: 'video-resolution',
    header: 'video-resolution-header',
    icon: 'video-size',
    options: [],
    exclude: ['high', '1080p'],
    persistent: true,
    optionsLocalizable: false,
  },

  recorderProfilesFront: {
    title: 'video-resolution',
    header: 'video-resolution-header',
    icon: 'video-size',
    options: [],
    persistent: true,
    optionsLocalizable: false,
  },

  flashModesPicture: {
    title: 'flash',
    options: [
      {
        key: 'auto',
        icon: 'flash-auto',
        title: 'flash-auto'
      },
      {
        key: 'on',
        icon: 'flash-on',
        title: 'flash-on'
      },
      {
        key: 'off',
        icon: 'flash-off',
        title: 'flash-off'
      }
    ],
    persistent: true
  },

  flashModesVideo: {
    title: 'flash',
    options: [
      {
        key: 'off',
        icon: 'flash-off',
        title: 'flash-off'
      },
      {
        key: 'torch',
        icon: 'flash-on',
        title: 'flash-on'
      }
    ],
    persistent: true
  },

  timer: {
    title: 'self-timer',
    header: 'self-timer-header',
    icon: 'self-timer',
    options: [
      {
        key: 'off',
        title: 'self-timer-off',
        value: 0
      },
      {
        key: 'secs2',
        value: 2,
        title: 'self-timer-2-seconds'
      },
      {
        key: 'secs5',
        value: 5,
        title: 'self-timer-5-seconds'
      },
      {
        key: 'secs10',
        value: 10,
        title: 'self-timer-10-seconds'
      }
    ],
    persistent: false,
  },

  hdr: {
    title: 'hdr',
    header: 'hdr-header',
    icon: 'hdr-boxed',
    disabled: false,
    options: [
      {
        key: 'off',
        title: 'hdr-off'
      },
      {
        key: 'on',
        title: 'hdr-on'
      }
    ],
    persistent: true
  },

  scene: {
    title: 'scene-mode',
    header: 'scene-mode-header',
    icon: 'scene',
    options: [
      {
        key: 'normal',
        title: 'scene-mode-normal'
      },
      {
        key: 'pano',
        title: 'scene-mode-panorama'
      },
      {
        key: 'beauty',
        title: 'scene-mode-beauty'
      }
    ],
    persistent: true,
  },

  grid: {
    title: 'grid',
    header: 'grid-header',
    icon: 'grid-circular',
    options: [
      {
        key: 'off',
        title: 'grid-off'
      },
      {
        key: 'on',
        title: 'grid-on'
      }
    ],
    selected: 'off',
    persistent: true,
    notifications: false
  },

  settingsMenu: {
    items: [
      // {
      //   key: 'scene'
      // },
      {
        key: 'hdr'
      },
      {
        key: 'timer'
      },
      // {
      //   key: 'pictureSizes'
      // },
      // {
      //   key: 'recorderProfiles'
      // },
      {
        key: 'grid'
      }
    ]
  }
};

});

define('lib/camera-utils',['require'],function(require) {
  /*jshint maxlen:false*/
  

  var CameraUtils = {};

  CameraUtils.scaleSizeToFitViewport = function(viewportSize, imageSize) {
    var sw = viewportSize.width / imageSize.width,
        sh = viewportSize.height / imageSize.height,
        scale;

    // Select the smaller scale to fit image completely within the viewport
    scale = Math.min(sw, sh);

    return {
      width: imageSize.width * scale,
      height: imageSize.height * scale
    };
  };

  CameraUtils.scaleSizeToFillViewport = function(viewportSize, imageSize) {
    var sw = viewportSize.width / imageSize.width,
        sh = viewportSize.height / imageSize.height,
        scale;

    // Select the larger scale to fill and overflow viewport with image
    scale = Math.max(sw, sh);

    return {
      width: imageSize.width * scale,
      height: imageSize.height * scale
    };
  };

  /**
   * Get the maximum preview size (in terms of area) from a list of
   * possible preview sizes.
   *
   * NOTE: If an `aspectRatio` value is provided, the search will be
   * constrained to only accept preview sizes matching that aspect
   * ratio.
   *
   * @param  {Array} previewSizes
   * @param  {Number} aspectRatio
   * @return {Object}
   */
  CameraUtils.getMaximumPreviewSize = function(previewSizes, aspectRatio) {

    // Use a very small tolerance because we want an exact match if we are
    // constraining to only include specific aspect ratios.
    const ASPECT_TOLERANCE = 0.001;

    var maximumArea = 0;
    var maximumPreviewSize = null;
    previewSizes.forEach(function(previewSize) {
      var area = previewSize.width * previewSize.height;

      if (aspectRatio) {
        var ratio = previewSize.width / previewSize.height;
        if (Math.abs(ratio - aspectRatio) > ASPECT_TOLERANCE) {
          return;
        }
      }

      if (area > maximumArea) {
        maximumArea = area;
        maximumPreviewSize = previewSize;
      }
    });

    return maximumPreviewSize;
  };

  return CameraUtils;
});

/* exported BlobView */


var BlobView = (function() {
  function fail(msg) {
    throw Error(msg);
  }

  // This constructor is for internal use only.
  // Use the BlobView.get() factory function or the getMore instance method
  // to obtain a BlobView object.
  function BlobView(blob, sliceOffset, sliceLength, slice,
                    viewOffset, viewLength, littleEndian)
  {
    this.blob = blob;                  // The parent blob that the data is from
    this.sliceOffset = sliceOffset;    // The start address within the blob
    this.sliceLength = sliceLength;    // How long the slice is
    this.slice = slice;                // The ArrayBuffer of slice data
    this.viewOffset = viewOffset;      // The start of the view within the slice
    this.viewLength = viewLength;      // The length of the view
    this.littleEndian = littleEndian;  // Read little endian by default?

    // DataView wrapper around the ArrayBuffer
    this.view = new DataView(slice, viewOffset, viewLength);

    // These fields mirror those of DataView
    this.buffer = slice;
    this.byteLength = viewLength;
    this.byteOffset = viewOffset;

    this.index = 0;   // The read methods keep track of the read position
  }

  // Async factory function
  BlobView.get = function(blob, offset, length, callback, littleEndian) {
    if (offset < 0) {
      fail('negative offset');
    }
    if (length < 0) {
      fail('negative length');
    }
    if (offset > blob.size) {
      fail('offset larger than blob size');
    }
    // Don't fail if the length is too big; just reduce the length
    if (offset + length > blob.size) {
      length = blob.size - offset;
    }
    var slice = blob.slice(offset, offset + length);
    var reader = new FileReader();
    reader.readAsArrayBuffer(slice);
    reader.onloadend = function() {
      var result = null;
      if (reader.result) {
        result = new BlobView(blob, offset, length, reader.result,
                              0, length, littleEndian || false);
      }
      callback(result, reader.error);
    };
  };

  // Synchronous factory function for use when you have an array buffer and want
  // to treat it as a BlobView (e.g. to use the readXYZ functions). We need
  // this for the music app, which uses an array buffer to hold
  // de-unsynchronized ID3 frames.
  BlobView.getFromArrayBuffer = function(buffer, offset, length, littleEndian) {
    return new BlobView(null, offset, length, buffer, offset, length,
                        littleEndian);
  };

  BlobView.prototype = {
    constructor: BlobView,

    // This instance method is like the BlobView.get() factory method,
    // but it is here because if the current buffer includes the requested
    // range of bytes, they can be passed directly to the callback without
    // going back to the blob to read them
    getMore: function(offset, length, callback) {
      // If we made this BlobView from an array buffer, there's no blob backing
      // it, and so it's impossible to get more data.
      if (!this.blob)
        fail('no blob backing this BlobView');

      if (offset >= this.sliceOffset &&
          offset + length <= this.sliceOffset + this.sliceLength) {
        // The quick case: we already have that region of the blob
        callback(new BlobView(this.blob,
                              this.sliceOffset, this.sliceLength, this.slice,
                              offset - this.sliceOffset, length,
                              this.littleEndian));
      }
      else {
        // Otherwise, we have to do an async read to get more bytes
        BlobView.get(this.blob, offset, length, callback, this.littleEndian);
      }
    },

    // Set the default endianness for the other methods
    littleEndian: function() {
      this.littleEndian = true;
    },
    bigEndian: function() {
      this.littleEndian = false;
    },

    // These "get" methods are just copies of the DataView methods, except
    // that they honor the default endianness
    getUint8: function(offset) {
      return this.view.getUint8(offset);
    },
    getInt8: function(offset) {
      return this.view.getInt8(offset);
    },
    getUint16: function(offset, le) {
      return this.view.getUint16(offset,
                                 le !== undefined ? le : this.littleEndian);
    },
    getInt16: function(offset, le) {
      return this.view.getInt16(offset,
                                le !== undefined ? le : this.littleEndian);
    },
    getUint32: function(offset, le) {
      return this.view.getUint32(offset,
                                 le !== undefined ? le : this.littleEndian);
    },
    getInt32: function(offset, le) {
      return this.view.getInt32(offset,
                                le !== undefined ? le : this.littleEndian);
    },
    getFloat32: function(offset, le) {
      return this.view.getFloat32(offset,
                                  le !== undefined ? le : this.littleEndian);
    },
    getFloat64: function(offset, le) {
      return this.view.getFloat64(offset,
                                  le !== undefined ? le : this.littleEndian);
    },

    // These "read" methods read from the current position in the view and
    // update that position accordingly
    readByte: function() {
      return this.view.getInt8(this.index++);
    },
    readUnsignedByte: function() {
      return this.view.getUint8(this.index++);
    },
    readShort: function(le) {
      var val = this.view.getInt16(this.index,
                                   le !== undefined ? le : this.littleEndian);
      this.index += 2;
      return val;
    },
    readUnsignedShort: function(le) {
      var val = this.view.getUint16(this.index,
                                    le !== undefined ? le : this.littleEndian);
      this.index += 2;
      return val;
    },
    readInt: function(le) {
      var val = this.view.getInt32(this.index,
                                   le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readUnsignedInt: function(le) {
      var val = this.view.getUint32(this.index,
                                    le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readFloat: function(le) {
      var val = this.view.getFloat32(this.index,
                                     le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readDouble: function(le) {
      var val = this.view.getFloat64(this.index,
                                     le !== undefined ? le : this.littleEndian);
      this.index += 8;
      return val;
    },

    // Methods to get and set the current position
    tell: function() {
      return this.index;
    },
    remaining: function() {
      return this.byteLength - this.index;
    },
    seek: function(index) {
      if (index < 0) {
        fail('negative index');
      }
      if (index > this.byteLength) {
        fail('index greater than buffer size');
      }
      this.index = index;
    },
    advance: function(n) {
      var index = this.index + n;
      if (index < 0) {
        fail('advance past beginning of buffer');
      }
      // It's usual that when we finished reading one target view,
      // the index is advanced to the start(previous end + 1) of next view,
      // and the new index will be equal to byte length(the last index + 1),
      // we will not fail on it because it means the reading is finished,
      // or do we have to warn here?
      if (index > this.byteLength) {
        fail('advance past end of buffer');
      }
      this.index = index;
    },

    // Additional methods to read other useful things
    getUnsignedByteArray: function(offset, n) {
      return new Uint8Array(this.buffer, offset + this.viewOffset, n);
    },

    // Additional methods to read other useful things
    readUnsignedByteArray: function(n) {
      var val = new Uint8Array(this.buffer, this.index + this.viewOffset, n);
      this.index += n;
      return val;
    },

    getBit: function(offset, bit) {
      var byte = this.view.getUint8(offset);
      return (byte & (1 << bit)) !== 0;
    },

    getUint24: function(offset, le) {
      var b1, b2, b3;
      if (le !== undefined ? le : this.littleEndian) {
        b1 = this.view.getUint8(offset);
        b2 = this.view.getUint8(offset + 1);
        b3 = this.view.getUint8(offset + 2);
      }
      else {    // big end first
        b3 = this.view.getUint8(offset);
        b2 = this.view.getUint8(offset + 1);
        b1 = this.view.getUint8(offset + 2);
      }

      return (b3 << 16) + (b2 << 8) + b1;
    },

    readUint24: function(le) {
      var value = this.getUint24(this.index, le);
      this.index += 3;
      return value;
    },

    // There are lots of ways to read strings.
    // ASCII, UTF-8, UTF-16.
    // null-terminated, character length, byte length
    // I'll implement string reading methods as needed

    getASCIIText: function(offset, len) {
      var bytes = new Uint8Array(this.buffer, offset + this.viewOffset, len);
      return String.fromCharCode.apply(String, bytes);
    },

    readASCIIText: function(len) {
      var bytes = new Uint8Array(this.buffer,
                                 this.index + this.viewOffset,
                                 len);
      this.index += len;
      return String.fromCharCode.apply(String, bytes);
    },

    // Replace this with the StringEncoding API when we've got it.
    // See https://bugzilla.mozilla.org/show_bug.cgi?id=764234
    getUTF8Text: function(offset, len) {
      function fail() { throw new Error('Illegal UTF-8'); }

      var pos = offset;         // Current position in this.view
      var end = offset + len;   // Last position
      var charcode;             // Current charcode
      var s = '';               // Accumulate the string
      var b1, b2, b3, b4;       // Up to 4 bytes per charcode

      // See http://en.wikipedia.org/wiki/UTF-8
      while (pos < end) {
        var b1 = this.view.getUint8(pos);
        if (b1 < 128) {
          s += String.fromCharCode(b1);
          pos += 1;
        }
        else if (b1 < 194) {
          // unexpected continuation character...
          fail();
        }
        else if (b1 < 224) {
          // 2-byte sequence
          if (pos + 1 >= end) {
            fail();
          }
          b2 = this.view.getUint8(pos + 1);
          if (b2 < 128 || b2 > 191) {
            fail();
          }
          charcode = ((b1 & 0x1f) << 6) + (b2 & 0x3f);
          s += String.fromCharCode(charcode);
          pos += 2;
        }
        else if (b1 < 240) {
          // 3-byte sequence
          if (pos + 2 >= end) {
            fail();
          }
          b2 = this.view.getUint8(pos + 1);
          if (b2 < 128 || b2 > 191) {
            fail();
          }
          b3 = this.view.getUint8(pos + 2);
          if (b3 < 128 || b3 > 191) {
            fail();
          }
          charcode = ((b1 & 0x0f) << 12) + ((b2 & 0x3f) << 6) + (b3 & 0x3f);
          s += String.fromCharCode(charcode);
          pos += 3;
        }
        else if (b1 < 245) {
          // 4-byte sequence
          if (pos + 3 >= end) {
            fail();
          }
          b2 = this.view.getUint8(pos + 1);
          if (b2 < 128 || b2 > 191) {
            fail();
          }
          b3 = this.view.getUint8(pos + 2);
          if (b3 < 128 || b3 > 191) {
            fail();
          }
          b4 = this.view.getUint8(pos + 3);
          if (b4 < 128 || b4 > 191) {
            fail();
          }
          charcode = ((b1 & 0x07) << 18) +
            ((b2 & 0x3f) << 12) +
            ((b3 & 0x3f) << 6) +
            (b4 & 0x3f);

          // Now turn this code point into two surrogate pairs
          charcode -= 0x10000;
          s += String.fromCharCode(0xd800 + ((charcode & 0x0FFC00) >>> 10));
          s += String.fromCharCode(0xdc00 + (charcode & 0x0003FF));

          pos += 4;
        }
        else {
          // Illegal byte
          fail();
        }
      }

      return s;
    },

    readUTF8Text: function(len) {
      try {
        return this.getUTF8Text(this.index, len);
      }
      finally {
        this.index += len;
      }
    },

    // Get UTF16 text.  If le is not specified, expect a BOM to define
    // endianness.  If le is true, read UTF16LE, if false, UTF16BE.
    getUTF16Text: function(offset, len, le) {
      if (len % 2) {
        fail('len must be a multiple of two');
      }
      if (le === null || le === undefined) {
        var BOM = this.getUint16(offset);
        len -= 2;
        offset += 2;
        if (BOM === 0xFEFF)
          le = false;
        else
          le = true;
      }

      // We need to support unaligned reads, so we can't use a Uint16Array here.
      var s = '';
      for (var i = 0; i < len; i += 2)
        s += String.fromCharCode(this.getUint16(offset + i, le));
      return s;
    },

    readUTF16Text: function(len, le) {
      var value = this.getUTF16Text(this.index, len, le);
      this.index += len;
      return value;
    },

    // Read 4 bytes, ignore the high bit and combine them into a 28-bit
    // big-endian unsigned integer.
    // This format is used by the ID3v2 metadata.
    getID3Uint28BE: function(offset) {
      var b1 = this.view.getUint8(offset) & 0x7f;
      var b2 = this.view.getUint8(offset + 1) & 0x7f;
      var b3 = this.view.getUint8(offset + 2) & 0x7f;
      var b4 = this.view.getUint8(offset + 3) & 0x7f;
      return (b1 << 21) | (b2 << 14) | (b3 << 7) | b4;
    },

    readID3Uint28BE: function() {
      var value = this.getID3Uint28BE(this.index);
      this.index += 4;
      return value;
    },

    // Read bytes up to and including a null terminator, but never
    // more than size bytes.  And return as a Latin1 string
    readNullTerminatedLatin1Text: function(size) {
      var s = '';
      for (var i = 0; i < size; i++) {
        var charcode = this.view.getUint8(this.index + i);
        if (charcode === 0) {
          i++;
          break;
        }
        s += String.fromCharCode(charcode);
      }
      this.index += i;
      return s;
    },

    // Read bytes up to and including a null terminator, but never
    // more than size bytes.  And return as a UTF8 string
    readNullTerminatedUTF8Text: function(size) {
      for (var len = 0; len < size; len++) {
        if (this.view.getUint8(this.index + len) === 0) {
          break;
        }
      }
      var s = this.readUTF8Text(len);
      if (len < size) {    // skip the null terminator if we found one
        this.advance(1);
      }
      return s;
    },

    // Read UTF16 text.  If le is not specified, expect a BOM to define
    // endianness.  If le is true, read UTF16LE, if false, UTF16BE
    // Read until we find a null-terminator, but never more than size bytes.
    readNullTerminatedUTF16Text: function(size, le) {
      if (size % 2) {
        fail('size must be a multiple of two');
      }
      if (le === null || le === undefined) {
        var BOM = this.readUnsignedShort();
        size -= 2;
        if (BOM === 0xFEFF) {
          le = false;
        } else {
          le = true;
        }
      }

      var s = '';
      for (var i = 0; i < size; i += 2) {
        var charcode = this.getUint16(this.index + i, le);
        if (charcode === 0) {
          i += 2;
          break;
        }
        s += String.fromCharCode(charcode);
      }
      this.index += i;
      return s;
    }
  };

  // We don't want users of this library to accidentally call the constructor
  // instead of using one of the factory functions, so we return a dummy object
  // instead of the real constructor. If someone really needs to get at the
  // real constructor, the contructor property of the prototype refers to it.
  return {
    get: BlobView.get,
    getFromArrayBuffer: BlobView.getFromArrayBuffer
  };
}());

define("BlobView", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.BlobView;
    };
}(this)));


/* global BlobView */
/* exported getVideoRotation */

//
// Given an MP4/Quicktime based video file as a blob, read through its
// atoms to find the track header "tkhd" atom and extract the rotation
// matrix from it. Convert the matrix value to rotation in degrees and
// pass that number to the specified callback function. If no value is
// found but the video file is valid, pass null to the callback. If
// any errors occur, pass an error message (a string) callback.
//
// See also:
// http://androidxref.com/4.0.4/xref/frameworks/base/media/libstagefright/MPEG4Writer.cpp
// https://developer.apple.com/library/mac/#documentation/QuickTime/QTFF/QTFFChap2/qtff2.html
//
function getVideoRotation(blob, rotationCallback) {

  // A utility for traversing the tree of atoms in an MP4 file
  function MP4Parser(blob, handlers) {
    // Start off with a 1024 chunk from the start of the blob.
    BlobView.get(blob, 0, Math.min(1024, blob.size), function(data, error) {
      // Make sure that the blob is, in fact, some kind of MP4 file
      if (data.byteLength <= 8 || data.getASCIIText(4, 4) !== 'ftyp') {
        handlers.errorHandler('not an MP4 file');
        return;
      }
      parseAtom(data);
    });

    // Call this with a BlobView object that includes the first 16 bytes of
    // an atom. It doesn't matter whether the body of the atom is included.
    function parseAtom(data) {
      var offset = data.sliceOffset + data.viewOffset; // atom position in blob
      var size = data.readUnsignedInt();               // atom length
      var type = data.readASCIIText(4);                // atom type
      var contentOffset = 8;                           // position of content

      if (size === 0) {
        // Zero size means the rest of the file
        size = blob.size - offset;
      }
      else if (size === 1) {
        // A size of 1 means the size is in bytes 8-15
        size = data.readUnsignedInt() * 4294967296 + data.readUnsignedInt();
        contentOffset = 16;
      }

      var handler = handlers[type] || handlers.defaultHandler;
      if (typeof handler === 'function') {
        // If the handler is a function, pass that function a
        // DataView object that contains the entire atom
        // including size and type.  Then use the return value
        // of the function as instructions on what to do next.
        data.getMore(data.sliceOffset + data.viewOffset, size, function(atom) {
          // Pass the entire atom to the handler function
          var rv = handler(atom);

          // If the return value is 'done', stop parsing.
          // Otherwise, continue with the next atom.
          // XXX: For more general parsing we need a way to pop some
          // stack levels.  A return value that is an atom name should mean
          // pop back up to this atom type and go on to the next atom
          // after that.
          if (rv !== 'done') {
            parseAtomAt(data, offset + size);
          }
        });
      }
      else if (handler === 'children') {
        // If the handler is this string, then assume that the atom is
        // a container atom and do its next child atom next
        var skip = (type === 'meta') ? 4 : 0; // special case for meta atoms
        parseAtomAt(data, offset + contentOffset + skip);
      }
      else if (handler === 'skip' || !handler) {
        // Skip the atom entirely and go on to the next one.
        // If there is no next one, call the eofHandler or just return
        parseAtomAt(data, offset + size);
      }
      else if (handler === 'done') {
        // Stop parsing
        return;
      }
    }

    function parseAtomAt(data, offset) {
      if (offset >= blob.size) {
        if (handlers.eofHandler) {
          handlers.eofHandler();
        }
        return;
      }
      else {
        data.getMore(offset, 16, parseAtom);
      }
    }
  }

  // We want to loop through the top-level atoms until we find the 'moov'
  // atom. Then, within this atom, there are one or more 'trak' atoms.
  // Each 'trak' should begin with a 'tkhd' atom. The tkhd atom has
  // a transformation matrix at byte 48.  The matrix is 9 32 bit integers.
  // We'll interpret those numbers as a rotation of 0, 90, 180 or 270.
  // If the video has more than one track, we expect all of them to have
  // the same rotation, so we'll only look at the first 'trak' atom that
  // we find.
  MP4Parser(blob, {
    errorHandler: function(msg) { rotationCallback(msg); },
    eofHandler: function() { rotationCallback(null); },
    defaultHandler: 'skip',  // Skip all atoms other than those listed below
    moov: 'children',        // Enumerate children of the moov atom
    trak: 'children',        // Enumerate children of the trak atom
    tkhd: function(data) {   // Pass the tkhd atom to this function
      // The matrix begins at byte 48
      data.advance(48);

      var a = data.readUnsignedInt();
      var b = data.readUnsignedInt();
      data.advance(4); // we don't care about this number
      var c = data.readUnsignedInt();
      var d = data.readUnsignedInt();

      if (a === 0 && d === 0) { // 90 or 270 degrees
        if (b === 0x00010000 && c === 0xFFFF0000) {
          rotationCallback(90);
        }
        else if (b === 0xFFFF0000 && c === 0x00010000) {
          rotationCallback(270);
        }
        else {
          rotationCallback('unexpected rotation matrix');
        }
      }
      else if (b === 0 && c === 0) { // 0 or 180 degrees
        if (a === 0x00010000 && d === 0x00010000) {
          rotationCallback(0);
        }
        else if (a === 0xFFFF0000 && d === 0xFFFF0000) {
          rotationCallback(180);
        }
        else {
          rotationCallback('unexpected rotation matrix');
        }
      }
      else {
        rotationCallback('unexpected rotation matrix');
      }
      return 'done';
    }
  });
}
;
define("getVideoRotation", ["BlobView"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.getVideoRotation;
    };
}(this)));

define('lib/get-video-meta-data',['require','exports','module','getVideoRotation'],function(require, exports, module) {


/**
 * Module Dependencies
 */

var getVideoRotation = require('getVideoRotation');

/**
 * Given the filename of a newly
 * recorded video, create a poster
 * image for it, and save that
 * poster as a jpeg file.
 *
 * When done, pass the video blob
 * and the poster blob to the
 * done function along with the
 * video dimensions and rotation.
 *
 * @param  {Blob}   blob
 * @param  {String}   filename
 * @param  {Function} done
 */
module.exports = createVideoPosterImage;


function createVideoPosterImage(blob, done) {
  var URL = window.URL;

  getVideoRotation(blob, onGotVideoRotation);

  function onGotVideoRotation(rotation) {
    if (typeof rotation !== 'number') {
      console.warn('Unexpected rotation:', rotation);
      rotation = 0;
    }

    var offscreenVideo = document.createElement('video');
    var url = URL.createObjectURL(blob);

    offscreenVideo.preload = 'metadata';
    offscreenVideo.src = url;
    offscreenVideo.onerror = onError;
    offscreenVideo.onloadeddata = onLoadedData;

    function onLoadedData() {
      var videowidth = offscreenVideo.videoWidth;
      var videoheight = offscreenVideo.videoHeight;

      // First, create a full-size
      // unrotated poster image
      var postercanvas = document.createElement('canvas');
      postercanvas.width = videowidth;
      postercanvas.height = videoheight;
      // Create the context after setting canvas dimensions so we don't realloc.
      // Use the willReadFrequently hint to use a software canvas off the gpu.
      var postercontext = postercanvas.getContext('2d', {
        willReadFrequently: true
      });

      postercontext.drawImage(offscreenVideo, 0, 0);

      // We're done with the
      // offscreen video element now
      URL.revokeObjectURL(url);
      offscreenVideo.removeAttribute('src');
      offscreenVideo.load();

      postercanvas.toBlob(function(imageBlob) {
        // Now that we've encoded the canvas image, we can free the
        // canvas memory by setting its size to 0.
        // This prevents a memory leak. See bug 1070195.
        postercanvas.width = 0;

        // It is probably unnecessary to clear these, doing it now might
        // cause them to be garbage collected sooner than otherwise.
        postercanvas = postercontext = null;

        done(null, {
          width: videowidth,
          height: videoheight,
          rotation: rotation,
          poster: {
            blob: imageBlob
          }
        });
      }, 'image/jpeg');
    }

    function onError() {
      URL.revokeObjectURL(url);
      offscreenVideo.removeAttribute('src');
      offscreenVideo.load();
      console.warn('not a video file delete it!');
      done('error');
    }
  }
}

});

(function(define){define('device-orientation',['require','exports','module'],function(require,exports,module){


// The time interval is allowed between two orientation change event
const ORIENTATION_CHANGE_INTERVAL = 300;

// The maximum sample inter-arrival time in milliseconds. If the acceleration
// samples are further apart than this amount in time, we reset the state of
// the low-pass filter and orientation properties.  This helps to handle
// boundary conditions when the app becomes invisisble, wakes from suspend or
// there is a significant gap in samples.
const MAX_MOTION_FILTER_TIME = 1000;

// Filtering adds latency proportional the time constant (inversely
// proportional to the cutoff frequency) so we don't want to make the time
// constant too large or we can lose responsiveness.  Likewise we don't want
// to make it too small or we do a poor job suppressing acceleration spikes.
// Empirically, 100ms seems to be too small and 500ms is too large. Android
// default is 200. The original version is from:
// http://mxr.mozilla.org/mozilla-central/source/widget/gonk/
//                                                      ProcessOrientation.cpp
const MOTION_FILTER_TIME_CONSTANT = 200;

var lastMotionFilteredTime = 0;
var lastMotionData = {x: 0, y: 0, z: 0, t: 0};
var pendingOrientation = null;
var orientationChangeTimer = 0;
var eventListeners = {'orientation': []};

function applyFilter(x, y, z) {
  var now = new Date().getTime();
  var filterReset = false;
  // The motion event is too far from last filtered data, reset the data.
  // This may be the case of hide app and go back.
  if (now > lastMotionData.t + MAX_MOTION_FILTER_TIME) {
    // clear data to re-initialize it.
    lastMotionData.x = 0;
    lastMotionData.y = 0;
    lastMotionData.z = 0;
    filterReset = true;
  }
  // applying the exponential moving average to x, y, z, when we already have
  // value of it.
  if (lastMotionData.x || lastMotionData.y || lastMotionData.z) {
    // use time to calculate alpha
    var diff = now - lastMotionFilteredTime;
    var alpha = diff / (MOTION_FILTER_TIME_CONSTANT + diff);

    // weight the x, y, z with alpha
    x = alpha * (x - lastMotionData.x) + lastMotionData.x;
    y = alpha * (y - lastMotionData.y) + lastMotionData.y;
    z = alpha * (z - lastMotionData.z) + lastMotionData.z;
  }

  // update the filter state.
  lastMotionData.x = x;
  lastMotionData.y = y;
  lastMotionData.z = z;
  lastMotionData.t = now;
  return filterReset;
}

function calcOrientation(x, y) {
  // use atan2(-x, y) to calculate the rotation on z axis.
  var orientationAngle = (Math.atan2(-x, y) * 180 / Math.PI);
  // The value range of atan2 is [-180, 180]. To have the [0, 360] value
  // range, we need to add 360 degrees when the angle is less than 0.
  if (orientationAngle < 0) {
    orientationAngle += 360;
  }

  // find the nearest orientation.
  // If an angle is >= 45 degrees, we view it as 90 degrees. If an angle is <
  // 45, we view it as 0 degree.
  var orientation = (((orientationAngle + 45) / 90) >> 0) % 4 * 90;
  return orientation;
}

function handleMotionEvent(e) {
  if (!e.accelerationIncludingGravity) {
    return;
  }

  var filterReset = applyFilter(e.accelerationIncludingGravity.x,
                                e.accelerationIncludingGravity.y,
                                e.accelerationIncludingGravity.z);

  // We don't need to process the event when filter is reset or no data.
  if (filterReset) {
    return;
  }

  var x = lastMotionData.x;
  var y = lastMotionData.y;
  var z = lastMotionData.z;

  // We only want to measure gravity, so ignore events when there is
  // significant acceleration in addition to gravity because this means the
  // user is moving the phone.
  if ((x * x + y * y + z * z) > 110) {
    return;
  }
  // If the camera is close to horizontal (pointing up or down) then we can't
  // tell what orientation the user intends, so we just return now without
  // changing the orientation. The constant 9.2 is the force of gravity (9.8)
  // times the cosine of 20 degrees. So if the phone is within 20 degrees of
  // horizontal, we will never change the orientation.
  if (z > 9.2 || z < -9.2) {
    return;
  }

  var orientation = calcOrientation(x, y);

  if (orientation === pendingOrientation) {
    return;
  }

  // When phone keeps the same orientation for ORIENTATION_CHANGE_INTERVAL
  // time interval, we change the orientation. Otherwrise the change is
  // cancelled. This may be that user rotates phone rapidly but captured by
  // device motion.
  if (orientationChangeTimer) {
    window.clearTimeout(orientationChangeTimer);
  }

  // If we don't have any current orientation, then send an event right away
  // Otherwise, wait to make sure we're stable before sending it.
  if (pendingOrientation === null) {
    pendingOrientation = orientation;
    fireOrientationChangeEvent(pendingOrientation);
  }
  else {
    // create timer for waiting to rotate the phone
    pendingOrientation = orientation;
    orientationChangeTimer = window.setTimeout(function doOrient() {
      fireOrientationChangeEvent(pendingOrientation);
      orientationChangeTimer = 0;
    }, ORIENTATION_CHANGE_INTERVAL);
  }
}

function start() {
  // Reset our state so that the first devicemotion event we get
  // will always generate an orientation event.
  pendingOrientation = null;
  window.addEventListener('devicemotion', handleMotionEvent);
}

function stop() {
  window.removeEventListener('devicemotion', handleMotionEvent);
  if (orientationChangeTimer) {
    clearTimeout(orientationChangeTimer);
    orientationChangeTimer = 0;
  }
}

function addEventListener(type, listener) {
  if (eventListeners[type] && listener) {
    eventListeners[type].push(listener);
  }
}

function removeEventListener(type, listener) {
  if (!eventListeners[type]) {
    return;
  }
  var idx = eventListeners[type].indexOf(listener);
  if (idx > -1) {
    eventListeners.slice(idx, 1);
  }
}

function fireOrientationChangeEvent(orientation) {
  eventListeners.orientation.forEach(function(listener) {
    if (listener.handleEvent) {
      listener.handleEvent(orientation);
    } else if ((typeof listener) === 'function') {
      listener(orientation);
    }
  });
}

module.exports = {
  start: start,
  stop: stop,
  on: addEventListener,
  off: removeEventListener
};

});})((function(n,w){return typeof define=='function'&&define.amd?
define:typeof module=='object'?function(c){c(require,exports,module);}:function(c){
var m={exports:{}},r=function(n){return w[n];};w[n]=c(r,m.exports,m)||m.exports;};})('device-orientation',this));
define('lib/orientation',['require','exports','module','device-orientation'],function(require, exports, module) {
  

  var listener = require('device-orientation');
  var classes = document.body.classList;
  var current = 0;

  listener.on('orientation', onOrientationChange);
  listener.start();

  function onOrientationChange(degrees) {
    classes.remove('deg' + current);
    classes.add('deg' + degrees);
    current = degrees;
  }

  // Camera normally has its orientation locked to portrait mode.
  // But we unlock orientation when displaying image and video previews.
  // When orientation is unlocked, we call listener.stop().
  // We calls call stop() when recording a video, and then restart
  // when recording is done. If our app ever changes so that we can call
  // unlock while the orientation listener is in the stopped state, then
  // we would need to modify the lock() function so that it did not
  // restart the listener. That is not needed now, however and is omitted.

  function unlock() {
    screen.mozUnlockOrientation();
    listener.stop();
  }

  function lock() {
    screen.mozLockOrientation('default');
    listener.start();
  }

  /**
   * Exports
   */

  module.exports = {
    on: listener.on,
    off: listener.off,
    start: listener.start,
    stop: listener.stop,
    unlock: unlock,
    lock: lock,
    get: function() {
      return current;
    }
  };
});

define('lib/bind-all',['require','exports','module'],function(require, exports, module) {


module.exports = function(object) {
  var key;
  var fn;
  for (key in object) {
    fn = object[key];
    if (typeof fn === 'function') {
      object[key] = fn.bind(object);
    }
  }
};

});

define('lib/camera/focus',['require','exports','module','lib/bind-all'],function(require, exports, module) {


/**
 * Module Dependencies
 */

var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = Focus;

/**
 * Options:
 *
 *   - {Boolean} `continousAutoFocus`
 *   - {Boolean} `touchFocus`
 *   - {Boolean} `faceDetection`
 */
function Focus(options) {
  bindAll(this);
  this.userPreferences = options || {};
  this.detectedFaces = [];
}

Focus.prototype.configure = function(mozCamera, mode) {
  var focusModes = mozCamera.capabilities.focusModes;
  var focusMode;
  this.mozCamera = mozCamera;
  this.configureFocusModes(mode);
  // Determines focus mode based on camera mode
  // In case of C-AF enabled
  if (this.continuousAutoFocus) {
    if (mode === 'picture') {
      focusMode = 'continuous-picture';
    } else if (mode === 'video'){
      focusMode = 'continuous-video';
    }
  }

  // auto is the default focus mode
  focusMode = focusMode || 'auto';

  // If auto or passed mode is not supported we pick the
  // first available in the hardware list
  if (focusModes.indexOf(focusMode) === -1) {
    focusMode = focusModes[0];
  }

  // If touch-to-focus is in progress we need to ensure
  // the correct mode is restored when it is complete
  this.suspendedMode = focusMode;
  mozCamera.focusMode = focusMode;
  this.reboot();
};

Focus.prototype.getMode = function() {
  var mozCamera = this.mozCamera;
  return this.suspendedMode || mozCamera.focusMode;
};

/**
 *  Configures focus modes based on user preferences
 *  and hardware availability
 */
Focus.prototype.configureFocusModes = function(mode) {
  var userPreferences = this.userPreferences;
  var continuousAutoFocusUserEnabled =
    userPreferences.continuousAutoFocus !== false;
  var touchFocusUserEnabled = userPreferences.touchFocus;
  var touchFocusSupported = this.isTouchFocusSupported();
  var faceDetectionUserEnabled = userPreferences.faceDetection;
  var faceDetectionSupported = this.isFaceDetectionSupported();
  this.continuousAutoFocus = continuousAutoFocusUserEnabled;
  // User preferences override defaults
  this.touchFocus = touchFocusUserEnabled && touchFocusSupported;
  // Face detection only enabled on picture mode (disabled on video)
  this.faceDetection =
    faceDetectionUserEnabled && faceDetectionSupported && mode === 'picture';
  this.mozCamera.addEventListener('focus', this.onAutoFocusStateChange);
};

Focus.prototype.startFaceDetection = function() {
  if (!this.faceDetection) { return; }
  this.mozCamera.addEventListener('facesdetected',
    this.handleFaceDetectionEvent);
  this.mozCamera.startFaceDetection();
};

Focus.prototype.stopFaceDetection = function() {
  // Clear suspenstion timers
  clearTimeout(this.faceDetectionSuspended);
  clearTimeout(this.faceDetectionSuspensionTimer);
  if (this.mozCamera.stopFaceDetection) {
    this.mozCamera.removeEventListener('facesdetected',
      this.handleFaceDetectionEvent);
    this.mozCamera.stopFaceDetection();
  }
  this.clearFaceDetection();
};

Focus.prototype.handleFaceDetectionEvent = function(e) {
  this.focusOnLargestFace(e.faces);
};

Focus.prototype.clearFaceDetection = function() {
  this.focusOnLargestFace([]);
};

Focus.prototype.suspendFaceDetection = function(ms, delay) {
  if (!this.faceDetection) {
    return;
  }
  var self = this;
  delay = delay || 0;
  clearTimeout(this.faceDetectionSuspended);
  clearTimeout(this.faceDetectionSuspensionTimer);
  this.faceDetectionSuspensionTimer = setTimeout(suspendFaceDetection, delay);
  function suspendFaceDetection() {
    self.faceDetectionSuspended = setTimeout(clearTimer, ms);
  }
  function clearTimer() {
    self.faceFocused = false;
    self.faceDetectionSuspended = undefined;
  }
};

Focus.prototype.stopContinuousFocus = function() {
  var focusMode = this.mozCamera.focusMode;
  // Clear suspension timers
  clearTimeout(this.continuousModeTimer);
  if (focusMode === 'continuous-picture' || focusMode === 'continuous-video') {
    this.suspendedMode = this.mozCamera.focusMode;
    this.mozCamera.focusMode = 'auto';
  }
};

Focus.prototype.resumeContinuousFocus = function() {
  this.mozCamera.focusMode = this.suspendedMode;
  this.suspendedMode = null;
  this.resetFocusAreas();
  this.mozCamera.resumeContinuousFocus();
};

Focus.prototype.suspendContinuousFocus = function(ms) {
  clearTimeout(this.continuousModeTimer);
  this.stopContinuousFocus();
  this.continuousModeTimer = setTimeout(this.resumeContinuousFocus, ms);
};

Focus.prototype.updateFocusState = function(state) {
  // Only update if the state has changed, and only transition to focused
  // or unfocused if we were previously focusing; this eliminates unfocused
  // rings just before a focusing state change.
  if (this.focusState !== state &&
      (this.focusState === 'focusing' || state === 'focusing')) {
    this.focusState = state;
    this.onAutoFocusChanged(state);
  }
};

Focus.prototype.onAutoFocusStateChange = function(e) {
  var state = e.newState;
  if (state === 'unfocused') {
    state = 'fail';
  }
  this.updateFocusState(state);
};

Focus.prototype.onAutoFocusChanged = function(state) {
  // NO OP by default
};

/**
 * Callback invoked when faces are detected
 * It's no op by default and it's meant to be overriden by
 * the user of the module in order to be informed about detected faces
 */
Focus.prototype.onFacesDetected = function(faces) {
  // NO OP by default
};

Focus.prototype.focusOnLargestFace = function(faces) {
  if (this.faceDetectionSuspended) {
    this.onFacesDetected([]);
    return;
  }

  this.detectedFaces = faces;
  this.onFacesDetected(this.detectedFaces);
};

/**
 * Focus the camera, invoke the callback asynchronously when done.
 *
 * If we only have fixed focus, then we call the callback right away
 * (but still asynchronously). Otherwise, we call autoFocus to focus
 * the camera and call the callback when focus is complete. In C-AF mode
 * this process should be fast. In manual AF mode, focusing takes about
 * a second and causes a noticeable delay before the picture is taken.
 *
 * @param  {Function} done
 * @private
 */
Focus.prototype.focus = function(done) {
  if (!this.mozCamera) { return; }
  done = done || function() {};
  var self = this;

  this.suspendContinuousFocus(10000);
  if (this.mozCamera.focusMode !== 'auto') {
    done();
    return;
  }

  //
  // In either focus mode, we call autoFocus() to ensure that the user gets
  // a sharp picture. The difference between the two modes is that if
  // C-AF is on, it is likely that the camera is already focused, so the
  // call to autoFocus() invokes its callback very quickly and we get much
  // better response time.
  //
  // In either case, the callback is passed a boolean specifying whether
  // focus was successful or not, and we display a green or red focus ring
  // then call the done callback, which takes the picture and clears
  // the focus ring.
  //
  this.updateFocusState('focusing');
  this.mozCamera.autoFocus().then(onSuccess, onError);

  // If focus fails with an error, we still need to signal the
  // caller. Interruptions are a special case, but other errors
  // can be treated the same as completing the operation but
  // remaining unfocused.
  function onError(err) {
    self.focused = false;
    if (err.name === 'NS_ERROR_IN_PROGRESS') {
      done('interrupted');
    } else {
      done('error');
    }
  }

  // This is fixed focus: there is nothing we can do here so we
  // should just call the callback and take the photo. No focus
  // happens so we don't display a focus ring.
  function onSuccess(success) {
    if (success) {
      self.focused = true;
      done('focused');
    } else {
      self.focused = false;
      done('failed');
    }
  }
};

/**
 * Resets focus regions
 */
Focus.prototype.resetFocusAreas = function() {
  if (!this.touchFocus) {
    return;
  }
  this.mozCamera.setFocusAreas([]);
  this.mozCamera.setMeteringAreas([]);
};

Focus.prototype.pause = function() {
  if (this.paused) { return; }
  this.stopContinuousFocus();
  this.stopFaceDetection();
  this.paused = true;
};

Focus.prototype.resume = function() {
  if (!this.paused) { return; }
  this.resumeContinuousFocus();
  this.startFaceDetection();
  this.paused = false;
};

Focus.prototype.reboot = function() {
  this.pause();
  this.resume();
};

/**
 *  Check if the hardware supports touch to focus
 */
Focus.prototype.isTouchFocusSupported = function() {
  var maxFocusAreas = this.mozCamera.capabilities.maxFocusAreas;
  return maxFocusAreas > 0;
};

/**
 * Check if hardware supports face detection
 */
Focus.prototype.isFaceDetectionSupported = function() {
  var cameraDetectsFaces = this.mozCamera.capabilities.maxDetectedFaces > 0;
  var apiAvailable = !!this.mozCamera.startFaceDetection;
  this.maxDetectedFaces = this.mozCamera.capabilities.maxDetectedFaces;
  return cameraDetectsFaces && apiAvailable;
};

Focus.prototype.updateFocusArea = function(rect, done) {
  done = done || function() {};
  if (!this.touchFocus) {
    done('touchToFocusNotAvailable');
    return;
  }
  this.updateFocusState('focusing');
  this.stopContinuousFocus();
  this.suspendFaceDetection(10000);
  this.mozCamera.setFocusAreas([rect]);
  this.mozCamera.setMeteringAreas([rect]);
  // Call auto focus to focus on focus area.
  this.focus(done);
};

});

define('lib/debounce',['require','exports','module'],function(require, exports, module) {


module.exports = function(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) { func.apply(context, args); }
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) { func.apply(context, args); }
  };
};

});
define('lib/mixin',['require','exports','module'],function(require, exports, module) {
  

  module.exports = function(a, b) {
    for (var key in b) { a[key] = b[key]; }
    return a;
  };
});

define('lib/camera/camera',['require','exports','module','lib/camera-utils','lib/get-video-meta-data','lib/orientation','lib/camera/focus','debug','lib/debounce','lib/bind-all','lib/mixin','model'],function(require, exports, module) {


/**
 * Module Dependencies
 */

var CameraUtils = require('lib/camera-utils');
var getVideoMetaData = require('lib/get-video-meta-data');
var orientation = require('lib/orientation');
var Focus = require('lib/camera/focus');
var debug = require('debug')('camera');
var debounce = require('lib/debounce');
var bindAll = require('lib/bind-all');
var mix = require('lib/mixin');
var model = require('model');

/**
 * Mixin `Model` API (inc. events)
 */

model(Camera.prototype);

/**
 * Exports
 */

module.exports = Camera;

/**
 * Initialize a new 'Camera'
 *
 * Options:
 *
 *   - {object} `focus`
 *
 * @param {Object} options
 */
function Camera(options) {
  debug('initializing');
  bindAll(this);

  // Options
  options = options || {};

  // mozCamera config is cached by default
  this.cacheConfig = options.cacheConfig !== false;

  // Minimum video duration length for creating a
  // video that contains at least few samples, see bug 899864.
  this.minRecordingTime = options.minRecordingTime  || 1000;

  // Number of bytes left on disk to let us stop recording.
  this.recordSpacePadding = options.recordSpacePadding || 1024 * 1024 * 1;

  // The minimum available disk space to start recording a video.
  this.recordSpaceMin = options.recordSpaceMin || 1024 * 1024 * 2;

  // The number of times to attempt
  // hardware request before giving up
  this.requestAttempts = options.requestAttempts || 3;

  // Test hooks
  this.getVideoMetaData = options.getVideoMetaData || getVideoMetaData;
  this.orientation = options.orientation || orientation;
  this.configStorage = options.configStorage || localStorage;

  this.cameraList = navigator.mozCameras.getListOfCameras();
  this.mozCamera = null;

  this.storage = options.storage || {};

  // Video config
  this.video = {
    filepath: null,
    minSpace: this.recordSpaceMin,
    spacePadding : this.recordSpacePadding
  };

  this.focus = new Focus(options.focus);
  this.suspendedFlashCount = 0;

  // Always boot in 'picture' mode
  // with 'back' camera. This may need
  // to be configurable at some point.
  this.mode = 'picture';
  this.selectedCamera = 'back';

  // Allow `configure` to be called multiple
  // times in the same frame, but only ever run once.
  this.configure = debounce(this.configure);

  debug('initialized');
}

/**
 * Loads the currently selected camera.
 *
 * There are cases whereby the camera
 * may still be 'releasing' its hardware.
 * If this is the case we wait for the
 * release process to finish, then attempt
 * to load again.
 *
 * @public
 */
Camera.prototype.load = function() {
  debug('load camera');

  var loadingNewCamera = this.selectedCamera !== this.lastLoadedCamera;
  var self = this;

  // If hardware is still being released
  // we're not allowed to request the camera.
  if (this.releasing) {
    debug('wait for camera release');
    this.once('released', function() { self.load(); });
    return;
  }

  // Don't re-load hardware if selected camera is the same.
  if (this.mozCamera && !loadingNewCamera) {
    this.setupNewCamera(this.mozCamera);
    debug('camera not changed');
    return;
  }

  // If a camera is already loaded,
  // it must be 'released' first.
  // We also discard the `mozCameraConfig`
  // as the previous camera config
  // won't apply to the new camera.
  if (this.mozCamera) {
    this.release(ready);
  } else {
    ready();
  }

  // Once ready we request the camera
  // with the currently `selectedCamera`
  // and any `mozCameraConfig` that may
  // be in memory.
  //
  // The only time there should be a
  // valid `mozCameraConfig` in memory
  // is when the app becomes visible again
  // after being hidden. and we wish to
  // request the camera again in exactly
  // the same state it was previously in.
  function ready() {
    self.requestCamera(self.selectedCamera);
    self.lastLoadedCamera = self.selectedCamera;
  }
};

/**
 * Requests the mozCamera object,
 * then configures it.
 *
 * @private
 */
Camera.prototype.requestCamera = function(camera, config) {
  if (!config) {
    config = {
      mode: this.mode
    };
  }

  debug('request camera', camera, config);
  if (this.isBusy) { return; }

  var attempts = this.requestAttempts;
  var self = this;

  // Indicate 'busy'
  this.configured = false;
  this.busy('requestingCamera');

  // Make initial request
  request();

  /**
   * Requests the camera hardware.
   *
   * @private
   */
  function request() {
    navigator.mozCameras.getCamera(camera, config)
      .then(onSuccess, onError);

    self.emit('requesting');
    debug('camera requested', camera, config);
    attempts--;
  }

  function onSuccess(params) {
    debug('successfully got mozCamera');

    // release camera when press power key
    // as soon as you open a camera app
    if (document.hidden) {
      self.mozCamera = params.camera;
      self.release();
      return;
    }

    self.updateConfig(params.configuration);
    self.setupNewCamera(params.camera);
    self.configureFocus();
    self.emit('focusconfigured', {
      mode: self.mozCamera.focusMode,
      touchFocus: self.focus.touchFocus,
      faceDetection: self.focus.faceDetection,
      maxDetectedFaces: self.focus.maxDetectedFaces
    });

    // If the camera was configured in the
    // `mozCamera.getCamera()` call, we can
    // fire the 'configured' event now.
    if (self.configured) { self.emit('configured'); }

    self.ready();
  }

  /**
   * Called when the request for camera
   * hardware fails.
   *
   * If the hardware is 'closed' we attempt
   * to re-request it one second later, until
   * all our attempts have run out.
   *
   * @param  {String} err
   */
  function onError(err) {
    debug('error requesting camera', err);

    if (err === 'HardwareClosed' && attempts) {
      self.cameraRequestTimeout = setTimeout(request, 1000);
      return;
    }

    self.emit('error', 'request-fail');
    self.ready();
  }
};

Camera.prototype.updateConfig = function(config) {
  this.givenPreviewSize = config.previewSize;
  this.pictureSize = config.pictureSize;
  this.recorderProfile = config.recorderProfile;
  this.configured = true;
};

/**
 * Configures the newly recieved
 * mozCamera object.
 *
 * Setting the 'cababilities' key
 * triggers 'change' callback inside
 * the CameraController that sets the
 * app up for the new camera.
 *
 * @param  {MozCamera} mozCamera
 * @private
 */
Camera.prototype.setupNewCamera = function(mozCamera) {
  debug('configuring camera');
  var capabilities = mozCamera.capabilities;
  this.mozCamera = mozCamera;

  // Bind to some events
  this.mozCamera.addEventListener('shutter', this.onShutter);
  this.mozCamera.addEventListener('close', this.onClosed);
  this.mozCamera.addEventListener('previewstatechange',
                                  this.onPreviewStateChange);
  this.mozCamera.addEventListener('recorderstatechange',
                                  this.onRecorderStateChange);

  this.capabilities = this.formatCapabilities(capabilities);

  this.emit('newcamera', this.capabilities);
  debug('configured new camera');
};

/**
 * Camera capablities need to be in
 * a consistent format.
 *
 * We shallow clone to make sure the
 * app doesnt' make changes to the
 * original `capabilities` object.
 *
 * @param  {Object} capabilities
 * @return {Object}
 */
Camera.prototype.formatCapabilities = function(capabilities) {
  var hasHDR = capabilities.sceneModes.indexOf('hdr') > -1;
  var hdr = hasHDR ? ['on', 'off'] : undefined;
  return mix({ hdr: hdr }, capabilities);
};

/**
 * Configure the camera hardware
 * with the current `mode`, `previewSize`
 * and `recorderProfile`.
 *
 * @private
 */
Camera.prototype.configure = function() {
  debug('configuring hardware...');
  var self = this;

  // As soon as a request to configure
  // comes in, the confuguration is now
  // dirty (out-of-date), and the hardware
  // must be reconfigured at some point.
  this.configured = false;

  // Ensure that any requests that
  // come in whilst busy get run once
  // camera is ready again.
  if (this.isBusy) {
    debug('defering configuration');
    this.once('ready', this.configure);
    return;
  }

  // Exit here if there is no camera
  if (!this.mozCamera) {
    debug('no mozCamera');
    return;
  }

  // In some extreme cases the mode can
  // get changed and configured whilst
  // video recording is in progress.
  this.stopRecording();

  // Indicate 'busy'
  this.busy();

  // Create a new `mozCameraConfig`
  var mozCameraConfig = {
    mode: this.mode,
    pictureSize: this.pictureSize,
    recorderProfile: this.recorderProfile
  };

  // Configure the camera hardware
  this.mozCamera.setConfiguration(mozCameraConfig)
    .then(onSuccess, onError);
  debug('mozCamera configuring', mozCameraConfig);

  function onSuccess(config) {
    debug('configuration success');
    if (!self.mozCamera) { return; }
    self.updateConfig(config);
    self.configureFocus();
    self.emit('configured');
    self.ready();
  }

  function onError(err) {
    debug('Error configuring camera');
    self.configured = true;
    self.ready();
  }
};

Camera.prototype.configureFocus = function() {
  this.focus.configure(this.mozCamera, this.mode);
  this.focus.onFacesDetected = this.onFacesDetected;
  this.focus.onAutoFocusChanged = this.onAutoFocusChanged;
};

Camera.prototype.shutdown = function() {
  this.stopRecording();
  this.set('previewActive', false);
  this.set('focus', 'none');
  this.release();
};

Camera.prototype.onAutoFocusChanged = function(state) {
  this.set('focus', state);
};

Camera.prototype.onFacesDetected = function(faces) {
  this.emit('facesdetected', faces);
};

/**
 * Plugs Video Stream into Video Element.
 *
 * @param  {Elmement} videoElement
 * @public
 */
Camera.prototype.loadStreamInto = function(videoElement) {
  debug('loading stream into element');
  if (!this.mozCamera) {
    debug('error - `mozCamera` is undefined or null');
    return;
  }

  // REVIEW: Something is wrong if we are
  // calling this without a video element.
  if (!videoElement) {
    debug('error - `videoElement` is undefined or null');
    return;
  }

  // Don't load the same camera stream again
  var isCurrent = videoElement.mozSrcObject === this.mozCamera;
  if (isCurrent) { return debug('camera didn\'t change'); }

  videoElement.mozSrcObject = this.mozCamera;
  videoElement.play();
  debug('stream loaded into video');
};

/**
 * Return available preview sizes.
 *
 * @return {Array}
 * @private
 */
Camera.prototype.previewSizes = function() {
  if (!this.mozCamera) { return; }
  return this.mozCamera.capabilities.previewSizes;
};

/**
 * Return the current optimal preview size.
 *
 * @return {Object}
 * @private
 */
Camera.prototype.previewSize = function() {
  return this.givenPreviewSize;
};

/**
 * Get the current recording resolution.
 *
 * @return {Object}
 */
Camera.prototype.resolution = function() {
  switch (this.mode) {
    case 'picture': return this.pictureSize;
    case 'video': return this.getRecorderProfile().video;
  }
};

/**
 * Set the picture size.
 *
 * If the given size is the same as the
 * currently set pictureSize then no
 * action is taken.
 *
 * The camera is 'configured' a soon as the
 * pictureSize is changed. `.configure` is
 * debounced so it will only ever run once
 * per turn.
 *
 * Options:
 *
 *   - {Boolean} `configure`
 *
 * @param {Object} size
 */
Camera.prototype.setPictureSize = function(size, options) {
  debug('set picture size', size);
  if (!size) { return; }

  // Configure unless `false`
  var configure = !(options && options.configure === false);

  // Don't do waste time re-configuring the
  // hardware if the pictureSize hasn't changed.
  if (this.isPictureSize(size)) {
    debug('pictureSize didn\'t change');
    return;
  }

  this.pictureSize = size;

  // Configure the hardware only when required
  if (configure) {
    this.configure();
  } else {
    this.mozCamera.setPictureSize(size);
  }
  this.setThumbnailSize();

  debug('pictureSize changed');
  return this;
};

Camera.prototype.isPictureSize = function(size) {
  if (!this.pictureSize) { return false; }
  var sameWidth = size.width === this.pictureSize.width;
  var sameHeight = size.height === this.pictureSize.height;
  return sameWidth && sameHeight;
};

/**
 * Set the recorder profile.
 *
 * If the given profile is the same as
 * the current profile, no action is
 * taken.
 *
 * The camera is 'configured' a soon as the
 * recorderProfile is changed (`.configure()` is
 * debounced so it will only ever run once
 * per turn).
 *
 * Options:
 *
 *   - {Boolean} `configure`
 *
 * @param {String} key
 */
Camera.prototype.setRecorderProfile = function(key, options) {
  debug('set recorderProfile: %s', key);
  if (!key) { return; }

  // Configure unless `false`
  var configure = !(options && options.configure === false);

  // Exit if not changed
  if (this.isRecorderProfile(key)) {
    debug('recorderProfile didn\'t change');
    return;
  }

  this.recorderProfile = key;
  if (configure) { this.configure(); }

  debug('recorderProfile changed: %s', key);
  return this;
};

Camera.prototype.isRecorderProfile = function(key) {
  return key === this.recorderProfile;
};

/**
 * Returns the full profile of the
 * currently set recordrProfile.
 *
 * @return {Object}
 */
Camera.prototype.getRecorderProfile = function() {
  var key = this.recorderProfile;
  return this.mozCamera.capabilities.recorderProfiles[key];
};

Camera.prototype.setThumbnailSize = function() {
  var sizes = this.mozCamera.capabilities.thumbnailSizes;
  var pictureSize = this.mozCamera.getPictureSize();
  var picked = this.pickThumbnailSize(sizes, pictureSize);
  if (picked) { this.mozCamera.setThumbnailSize(picked); }
};

/**
 * Sets the current flash mode,
 * both on the Camera instance
 * and on the cameraObj hardware.
 * If flash is suspended, it
 * updates the cached state that
 * will be restored.
 *
 * @param {String} key
 */
Camera.prototype.setFlashMode = function(key) {
  if (this.mozCamera) {
    // If no key was provided, set it to 'off' which is
    // a valid flash mode.
    key = key || 'off';

    if (this.suspendedFlashCount > 0) {
      this.suspendedFlashMode = key;
      debug('flash mode set while suspended: %s', key);
    } else {
      this.mozCamera.flashMode = key;
      debug('flash mode set: %s', key);
    }
  }

  return this;
};

/**
 * Releases the camera hardware.
 *
 * @param  {Function} done
 */
Camera.prototype.release = function(done) {
  debug('release');
  done = done || function() {};
  var self = this;

  // Clear any pending hardware requests
  clearTimeout(this.cameraRequestTimeout);

  // Ignore if there is no loaded camera
  if (!this.mozCamera) {
    done();
    return;
  }

  this.busy();
  this.stopRecording();
  this.set('focus', 'none');
  this.mozCamera.release().then(onSuccess, onError);
  this.releasing = true;
  this.mozCamera = null;

  // Reset cached parameters
  delete this.pictureSize;
  delete this.recorderProfile;
  delete this.givenPreviewSize;

  function onSuccess() {
    debug('successfully released');
    self.ready();
    self.releasing = false;
    self.emit('released');
    done();
  }

  function onError(err) {
    debug('failed to release hardware');
    self.ready();
    self.releasing = false;
    done(err);
  }
};

// TODO: Perhaps this function should be moved into a separate lib
Camera.prototype.pickThumbnailSize = function(thumbnailSizes, pictureSize) {
  var screenWidth = window.innerWidth * window.devicePixelRatio;
  var screenHeight = window.innerHeight * window.devicePixelRatio;
  var pictureAspectRatio = pictureSize.width / pictureSize.height;
  var currentThumbnailSize;
  var i;

  // Coping the array to not modify the original
  thumbnailSizes = thumbnailSizes.slice(0);
  if (!thumbnailSizes || !pictureSize) {
    return;
  }

  function imageSizeFillsScreen(pixelsWidth, pixelsHeight) {
    return ((pixelsWidth >= screenWidth || // portrait
             pixelsHeight >= screenHeight) &&
            (pixelsWidth >= screenHeight || // landscape
             pixelsHeight >= screenWidth));
  }

  // Removes the sizes with the wrong aspect ratio
  thumbnailSizes = thumbnailSizes.filter(function(thumbnailSize) {
    var thumbnailAspectRatio = thumbnailSize.width / thumbnailSize.height;
    return Math.abs(thumbnailAspectRatio - pictureAspectRatio) < 0.05;
  });

  if (thumbnailSizes.length === 0) {
    console.error('Error while selecting thumbnail size. ' +
      'There are no thumbnail sizes that match the ratio of ' +
      'the selected picture size: ' + JSON.stringify(pictureSize));
    return;
  }

  // Sorting the array from smaller to larger sizes
  thumbnailSizes.sort(function(a, b) {
    return a.width * a.height - b.width * b.height;
  });

  for (i = 0; i < thumbnailSizes.length; ++i) {
    currentThumbnailSize = thumbnailSizes[i];
    if (imageSizeFillsScreen(currentThumbnailSize.width,
                             currentThumbnailSize.height)) {
      return currentThumbnailSize;
    }
  }

  return thumbnailSizes[thumbnailSizes.length - 1];
};

/**
 * Takes a photo, or begins/ends
 * a video capture session.
 *
 * Options:
 *
 *   - `position` {Object} - geolocation to store in EXIF
 *
 * @param  {Object} options
 * @public
 */
Camera.prototype.capture = function(options) {
  if (!this.mozCamera) { return false; }
  switch (this.mode) {
    case 'picture': this.takePicture(options); break;
    case 'video': this.toggleRecording(options); break;
  }
};

/**
 * Take a picture.
 *
 * Options:
 *
 *   - {Number} `position` - geolocation to store in EXIF
 *
 * @param  {Object} options
 */
Camera.prototype.takePicture = function(options) {
  debug('take picture', options);
  this.busy();

  var rotation = this.orientation.get();
  var selectedCamera = this.selectedCamera;
  var self = this;
  var position = options && options.position;
  var config = {
    dateTime: Date.now() / 1000,
    pictureSize: self.pictureSize,
    fileFormat: 'jpeg'
  };

  // If position has been passed in,
  // add it to the config object.
  if (position) {
    config.position = position;
  }

  // Front camera is inverted, so flip rotation
  config.rotation = selectedCamera === 'front' ? -rotation : rotation;

  // If the camera focus is 'continuous' or 'infinity'
  // we can take the picture straight away.
  if (this.focus.getMode() === 'auto') {
    this.focus.focus(onFocused);
  } else {
    takePicture();
  }

  function onFocused(state) {
    takePicture();
  }

  function takePicture() {
    self.busy('takingPicture');
    self.mozCamera.takePicture(config).then(onSuccess, onError);
  }

  function onError(error) {
    var title = navigator.mozL10n.get('error-saving-title');
    var text = navigator.mozL10n.get('error-saving-text');

    // if taking a picture fails because there's
    // already a picture being taken we ignore it.
    if (error === 'TakePictureAlreadyInProgress') {
      complete();
    } else {
      alert(title + '. ' + text);
      debug('error taking picture');
      complete();
    }
  }

  function onSuccess(blob) {
    var image = { blob: blob };
    self.resumePreview();
    self.set('focus', 'none');
    self.emit('newimage', image);
    debug('success taking picture');
    complete();
  }

  function complete() {
    self.set('focus', 'none');
    self.ready();
  }
};

Camera.prototype.updateFocusArea = function(rect, done) {
  this.focus.updateFocusArea(rect, focusDone);
  function focusDone(state) {
    if (done) {
      done(state);
    }
  }
};

/**
 * Start/stop recording.
 *
 * @param  {Object} options
 */
Camera.prototype.toggleRecording = function(options) {
  var recording = this.get('recording');
  if (recording) { this.stopRecording(); }
  else { this.startRecording(options); }
};

/**
 * Seet the storage for video.
 *
 * @public
 */
Camera.prototype.setVideoStorage = function(storage) {
  this.storage.video = storage;
};

/**
 * Start recording a video.
 *
 * @public
 */
Camera.prototype.startRecording = function(options) {
  debug('start recording');
  var frontCamera = this.selectedCamera === 'front';
  var rotation = this.orientation.get();
  var storage = this.storage.video;
  var video = this.video;
  var self = this;

  // Rotation is flipped for front camera
  if (frontCamera) { rotation = -rotation; }

  this.set('recording', true);
  this.busy();

  // Lock orientation during video recording
  //
  // REVIEW: This should *not* be here. This
  // is an App concern and should live in
  // the `CameraController`.
  this.orientation.stop();

  // First check if there is enough free space
  this.getFreeVideoStorageSpace(gotStorageSpace);

  function gotStorageSpace(err, freeBytes) {
    if (err) { return self.onRecordingError(); }

    var notEnoughSpace = freeBytes < self.video.minSpace;
    var remaining = freeBytes - self.video.spacePadding;
    var targetFileSize = self.get('maxFileSizeBytes');
    var maxFileSizeBytes = targetFileSize || remaining;

    // Don't continue if there
    // is not enough space
    if (notEnoughSpace) {
      self.onRecordingError('nospace2');
      return;
    }

    // TODO: Callee should
    // pass in orientation
    var config = {
      rotation: rotation,
      maxFileSizeBytes: maxFileSizeBytes
    };

    self.createVideoFilepath(createVideoFilepathDone);

    function createVideoFilepathDone(errorMsg, filepath) {
      if (typeof filepath === 'undefined') {
        debug(errorMsg);
        self.onRecordingError('error-video-file-path');
        return;
      }

      video.filepath = filepath;
      self.emit('willrecord');
      self.mozCamera.startRecording(config, storage, filepath)
        .then(onSuccess, onError);
    }
  }

  function onError(err) {
    // Ignore err as we use our own set of error
    // codes; instead trigger using the default
    self.onRecordingError();
  }

  function onSuccess() {
    self.startVideoTimer();
    self.ready();

    // User closed app while
    // recording was trying to start
    //
    // TODO: Not sure this should be here
    if (document.hidden) {
      self.stopRecording();
    }
  }
};

/**
 * Stop recording the video.
 *
 * Once we have told the camera to stop recording
 * the video we attach a 'change' listener to the
 * video storage and wait. Once the listener fires
 * we know that the video file has been saved.
 *
 * At this point we fetch the file Blob from
 * storage and then call the `.onNewVideo()`
 * method to handle the final stages.
 *
 * @public
 */
Camera.prototype.stopRecording = function() {
  debug('stop recording');

  var notRecording = !this.get('recording');
  var filepath = this.video.filepath;
  var storage = this.storage.video;
  var self = this;

  if (notRecording) { return; }

  this.busy();
  this.stopVideoTimer();
  this.mozCamera.stopRecording();
  this.set('recording', false);

  // Unlock orientation when stopping video recording.
  // REVIEW:WP This logic is out of scope of the
  // Camera hardware. Only the App should be
  // making such high level decicions.
  this.orientation.start();

  // Register a listener for writing
  // completion of current video file
  storage.addEventListener('change', onStorageChange);

  function onStorageChange(e) {
    // If the storage becomes unavailable
    // For instance when yanking the SD CARD
    if (e.reason === 'unavailable') {
      storage.removeEventListener('change', onStorageChange);
      self.emit('ready');
      return;
    }
    debug('video file ready', e.path);
    var matchesFile = e.path.indexOf(filepath) > -1;

    // Regard the modification as video file writing
    // completion if e.path matches current video
    // filename. Note e.path is absolute path.
    if (e.reason !== 'modified' || !matchesFile) { return; }

    // We don't need the listener anymore.
    storage.removeEventListener('change', onStorageChange);

    // Re-fetch the blob from storage
    var req = storage.get(filepath);
    req.onerror = self.onRecordingError;
    req.onsuccess = onSuccess;

    function onSuccess() {
      debug('got video blob');
      self.onNewVideo({
        blob: req.result,
        filepath: filepath
      });
    }
  }
};

/**
 * Once we have got the new video blob
 * from storage we assemble the video
 * object and then get video meta data
 * to add to it.
 *
 * If the video was too short, we delete
 * it from storage and abort to prevent
 * the app from ever knowing a new
 * (potentially corrupted) video file
 * was recorded.
 *
 * @param  {Object} video
 * @private
 */
Camera.prototype.onNewVideo = function(video) {
  debug('got new video', video);

  var elapsedTime = this.get('videoElapsed');
  var tooShort = elapsedTime < this.minRecordingTime;
  var self = this;

  // Discard videos that are too
  // short and possibly corrupted.
  if (tooShort) {
    debug('video too short, deleting...');
    this.storage.video.delete(video.filepath);
    this.ready();
    return;
  }

  // Finally extract some metadata before
  // telling the app the new video is ready.
  this.getVideoMetaData(video.blob, gotVideoMetaData);

  function gotVideoMetaData(error, data) {
    if (error) {
      self.onRecordingError();
      return;
    }

    // Bolt on additional metadata
    video.poster = data.poster;
    video.width = data.width;
    video.height = data.height;
    video.rotation = data.rotation;

    // Tell the app the new video is ready
    self.emit('newvideo', video);
    self.ready();
  }
};

// TODO: This is UI stuff, so
// shouldn't be handled in this file.
Camera.prototype.onRecordingError = function(id) {
  id = id && id !== 'FAILURE' ? id : 'error-recording';
  var title = navigator.mozL10n.get(id + '-title');
  var text = navigator.mozL10n.get(id + '-text');
  alert(title + '. ' + text);
  this.set('recording', false);
  this.ready();
};

/**
 * Emit a 'shutter' event so that
 * app UI can respond with shutter
 * animations and sounds effects.
 *
 * @private
 */
Camera.prototype.onShutter = function() {
  this.emit('shutter');
};

/**
 * Emit a 'closed' event when camera controller
 * closes
 *
 * @private
 */
Camera.prototype.onClosed = function(e) {
  this.shutdown();
  this.emit('closed', e.reason);
};

/**
 * The preview state change events come
 * from the camera hardware. If 'stopped'
 * or 'paused' the camera must not be used.
 *
 * @param  event with {String} newState ['started', 'stopped', 'paused']
 * @private
 */
Camera.prototype.onPreviewStateChange = function(e) {
  var state = e.newState;
  debug('preview state change: %s', state);
  this.previewState = state;
  this.emit('preview:' + state);
};

/**
 * Emit useful event hook.
 *
 * @param  {String} msg
 * @private
 */
Camera.prototype.onRecorderStateChange = function(e) {
  var msg = e.newState;
  if (msg === 'FileSizeLimitReached') {
    this.emit('filesizelimitreached');
  }
};

/**
 * Get the number of remaining
 * bytes in video storage.
 *
 * @param  {Function} done
 * @async
 * @private
 */
Camera.prototype.getFreeVideoStorageSpace = function(done) {
  debug('get free storage space');

  var storage = this.storage.video;
  var req = storage.freeSpace();
  req.onerror = onError;
  req.onsuccess = onSuccess;

  function onSuccess() {
    var freeBytes = req.result;
    debug('%d free space found', freeBytes);
    done(null, freeBytes);
  }

  function onError() {
    done('error');
  }
};

/**
 * Get a unique video filepath
 * to record a new video to.
 *
 * Your application can overwrite
 * this method with something
 * so that you can record directly
 * to final location. We do this
 * in CameraController.
 *
 * Callback function signature used
 * so that an async override can
 * be used if you wish.
 *
 * @param  {Function} done
 */
Camera.prototype.createVideoFilepath = function(done) {
  done(null, Date.now() + '_tmp.3gp');
};

/**
 * Resume the preview stream.
 *
 * After a photo has been taken the
 * preview stream freezes on the
 * taken frame. We call this function
 * to start the stream flowing again.
 *
 * @private
 */
Camera.prototype.resumePreview = function() {
  this.mozCamera.resumePreview();
  // After calling takePicture(Camera.ShutterCallback, Camera.PictureCallback,
  // Camera.PictureCallback) or stopPreview(), and then resuming preview with
  // startPreview(), the apps should call this method again to resume face
  // detection. See Bug 1070791.
  this.focus.startFaceDetection();
  this.emit('previewresumed');
};

/**
 * Sets the selected camera to the
 * given string and then reloads
 * the camera.
 *
 * If the given camera is already
 * selected, no action is taken.
 *
 * @param {String} camera 'front'|'back'
 * @public
 */
Camera.prototype.setCamera = function(camera) {
  debug('set camera: %s', camera);
  if (this.selectedCamera === camera) { return; }
  this.selectedCamera = camera;
  this.load();
};

/**
 * Toggles between 'picture'
 * and 'video' capture modes.
 *
 * @return {String}
 * @public
 */
Camera.prototype.setMode = function(mode) {
  debug('setting mode to: %s', mode);
  if (this.isMode(mode)) { return; }
  this.mode = mode;
  this.configure();
  return this;
};

/**
 * States if the camera is currently
 * set to the passed mode.
 *
 * @param  {String}  mode  ['picture'|'video']
 * @return {Boolean}
 * @public
 */
Camera.prototype.isMode = function(mode) {
  return this.mode === mode;
};

/**
 * Sets a start time and begins
 * updating the elapsed time
 * every second.
 *
 * @private
 */
Camera.prototype.startVideoTimer = function() {
  this.set('videoStart', new Date().getTime());
  this.videoTimer = setInterval(this.updateVideoElapsed, 1000);
  this.updateVideoElapsed();
};

/**
 * Clear the video timer interval.
 *
 * @private
 */
Camera.prototype.stopVideoTimer = function() {
  clearInterval(this.videoTimer);
  this.videoTimer = null;
};

/**
 * Calculates the elapse time
 * and updateds the 'videoElapsed'
 * value.
 *
 * We listen for the 'change:'
 * event emitted elsewhere to
 * update the UI accordingly.
 *
 */
Camera.prototype.updateVideoElapsed = function() {
  var now = new Date().getTime();
  var start = this.get('videoStart');
  this.set('videoElapsed', (now - start));
};

/**
 * Set ISO value.
 *
 * @param {String} value
 * @public
 */
Camera.prototype.setISOMode = function(value) {
  var isoModes = this.mozCamera.capabilities.isoModes;
  if (isoModes && isoModes.indexOf(value) > -1) {
    this.mozCamera.isoMode = value;
  }
};

/**
 * Set the mozCamera white-balance value.
 *
 * @param {String} value
 * @public
 */
Camera.prototype.setWhiteBalance = function(value){
  var capabilities = this.mozCamera.capabilities;
  var modes = capabilities.whiteBalanceModes;
  if (modes && modes.indexOf(value) > -1) {
    this.mozCamera.whiteBalanceMode = value;
  }
};

/**
 * Set HDR mode.
 *
 * HDR is a scene mode, so we
 * transform the hdr value to
 * the appropriate scene value.
 *
 * @param {String} value
 * @public
 */
Camera.prototype.setHDR = function(value){
  debug('set hdr: %s', value);
  if (!value) { return; }
  var scene = value === 'on' ? 'hdr' : 'auto';
  this.setSceneMode(scene);
};

/**
 * Set scene mode.
 *
 * @param {String} value
 * @public
 */
Camera.prototype.setSceneMode = function(value){
  var modes = this.mozCamera.capabilities.sceneModes;
  if (modes.indexOf(value) > -1) {
    this.mozCamera.sceneMode = value;
  }
};

/**
 * Check if the hardware supports zoom.
 *
 * @return {Boolean}
 */
Camera.prototype.isZoomSupported = function() {
  return this.mozCamera.capabilities.zoomRatios.length > 1;
};

Camera.prototype.configureZoom = function() {
  var previewSize = this.previewSize();
  var maxPreviewSize =
    CameraUtils.getMaximumPreviewSize(this.previewSizes());

  // Calculate the maximum amount of zoom that the hardware will
  // perform. This calculation is determined by taking the maximum
  // supported preview size *width* and dividing by the current preview
  // size *width*.
  var maxHardwareZoom = maxPreviewSize.width / previewSize.width;
  this.set('maxHardwareZoom', maxHardwareZoom);

  this.setZoom(this.getMinimumZoom());
  this.emit('zoomconfigured', this.getZoom());
  return this;
};

Camera.prototype.getMinimumZoom = function() {
  var zoomRatios = this.mozCamera.capabilities.zoomRatios;
  if (zoomRatios.length === 0) {
    return 1.0;
  }

  return zoomRatios[0];
};

Camera.prototype.getMaximumZoom = function() {
  var zoomRatios = this.mozCamera.capabilities.zoomRatios;
  if (zoomRatios.length === 0) {
    return 1.0;
  }

  return zoomRatios[zoomRatios.length - 1];
};

Camera.prototype.getZoom = function() {
  return this.mozCamera.zoom;
};

Camera.prototype.setZoom = function(zoom) {
  this.zoom = zoom;
  this.emit('zoomchanged', this.zoom);

  // Stop here if we're already waiting for
  // `mozCamera.zoom` to be updated.
  if (this.zoomChangeTimeout) {
    return;
  }

  var self = this;

  // Throttle to prevent hammering the Camera API.
  this.zoomChangeTimeout = window.setTimeout(function() {
    self.zoomChangeTimeout = null;

    self.mozCamera.zoom = self.zoom;
  }, 150);
};

Camera.prototype.getZoomPreviewAdjustment = function() {
  var zoom = this.mozCamera.zoom;
  var maxHardwareZoom = this.get('maxHardwareZoom');
  if (zoom <= maxHardwareZoom) {
    return 1.0;
  }

  return zoom / maxHardwareZoom;
};

/**
 * Retrieves the angle of orientation of the camera hardware's
 * image sensor. This value is calculated as the angle that the
 * camera image needs to be rotated (clockwise) so that it appears
 * correctly on the display in the device's natural (portrait)
 * orientation
 *
 * Reference:
 * http://developer.android.com/reference/android/hardware/Camera.CameraInfo.html#orientation
 *
 * @return {Number}
 * @public
 */
Camera.prototype.getSensorAngle = function() {
  return this.mozCamera && this.mozCamera.sensorAngle;
};

/**
 * A central place to indicate
 * the camera is 'busy'.
 *
 * @private
 */
Camera.prototype.busy = function(type) {
  debug('busy %s', type || '');
  this.isBusy = true;
  this.emit('busy', type);
  clearTimeout(this.readyTimeout);
};

/**
 * A central place to indicate
 * the camera is 'ready'.
 *
 * @private
 */
Camera.prototype.ready = function() {
  var self = this;
  this.isBusy = false;
  clearTimeout(this.readyTimeout);
  this.readyTimeout = setTimeout(function() {
    debug('ready');
    self.emit('ready');
  }, 150);
};

});



(function(window) {

  // Placeholder for storing statically generated performance timestamps,
  // similar to window.performance
  window.mozPerformance = {
    timing: {}
  };

  function dispatch(name) {
    if (!window.mozPerfHasListener) {
      return;
    }

    var now = window.performance.now();
    var epoch = Date.now();

    setTimeout(function() {
      var detail = {
        name: name,
        timestamp: now,
        epoch: epoch
      };
      var event = new CustomEvent('x-moz-perf', { detail: detail });

      window.dispatchEvent(event);
    });
  }

  [
    'moz-chrome-dom-loaded',
    'moz-chrome-interactive',
    'moz-app-visually-complete',
    'moz-content-interactive',
    'moz-app-loaded'
  ].forEach(function(eventName) {
      window.addEventListener(eventName, function mozPerfLoadHandler() {
        dispatch(eventName);
      }, false);
    });

  window.PerformanceTestingHelper = {
    dispatch: dispatch
  };

})(window);

define("performance-testing-helper", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.PerformanceTestingHelper;
    };
}(this)));

//
// While the app is visible, listen for magic settings changes that
// are signals from the system app that we will soon be hidden, and
// emit a synthetic 'stoprecording' event when these settings changes
// occur. For apps like Camera, the visiblitychange event can arrive
// too late (see bugs 995540 and 1051172) and we need an event that
// tells us more promptly when to stop recording.
//
// Note that this hack is needed when the phone is under heavy
// memory pressure and is swapping. So we want to be really careful
// to only listen for settings events when we actually are the
// foreground app. We don't want a bunch of background apps to have
// to wake up and handle an event every time the user presses the
// Home button: that would just make the swapping issues worse!
//
(function(exports) {
  

  const stopRecordingKey = 'private.broadcast.stop_recording';
  const attentionScreenKey = 'private.broadcast.attention_screen_opening';

  function start() {
    // If we are visible, start listening to settings events
    if (!document.hidden) {
      listen();
    }

    // And listen and unlisten as our visibility changes
    window.addEventListener('visibilitychange', visibilityChangeHandler);
  }

  function stop() {
    // Stop tracking visibility
    window.removeEventListener('visibilitychange', visibilityChangeHandler);

    // And stop listening to the settings db
    unlisten();
  }

  function visibilityChangeHandler() {
    if (document.hidden) {
      unlisten();  // If hidden, ignore setings changes
    }
    else {
      listen();    // If visible, respond to settings changes
    }
  }

  function listen() {
    if (!navigator.mozSettings) {
      return;
    }
    navigator.mozSettings.addObserver(stopRecordingKey,
                                      stopRecordingObserver);
    navigator.mozSettings.addObserver(attentionScreenKey,
                                      stopRecordingObserver);
  }

  function unlisten() {
    if (!navigator.mozSettings) {
      return;
    }
    navigator.mozSettings.removeObserver(stopRecordingKey,
                                         stopRecordingObserver);
    navigator.mozSettings.removeObserver(attentionScreenKey,
                                         stopRecordingObserver);
  }

  function stopRecordingObserver(event) {
    if (event.settingValue) {
      window.dispatchEvent(new CustomEvent('stoprecording'));
    }
  }

  exports.StopRecordingEvent = {
    start: start,
    stop: stop
  };

}(window));

define("stop-recording-event", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.StopRecordingEvent;
    };
}(this)));

(function(define){define('view',['require','exports','module','evt'],function(require,exports,module){


/**
 * Module Dependencies
 */

var events = require('evt');

/**
 * Locals
 */

var counter = 1;
var noop = function() {};

/**
 * Exports
 */

module.exports = View;

/**
 * Base view class. Accepts
 * or creates a root element
 * which we template into.
 *
 * @constructor
 */
function View(options) {
  options = options || {};
  this.el = options.el || this.el || document.createElement(this.tag);
  this.el.id = this.el.id || ('view' + counter++);
  this.name = options.name || this.name;
  this.els = {};

  if (!this.el.className) {
    if (this.name) this.el.className = this.name;
    if (this.className) this.el.className += ' ' + this.className;
  }

  bindAll(this);
  this.initialize.apply(this, arguments);
}

/**
 * Base view prototype,
 * mixed in event emitter.
 *
 * @type {Object}
 */
events(View.prototype);

// Allow for 'emit' or
// 'fire' to trigger events
View.prototype.fire = View.prototype.fire || View.prototype.emit;

/**
 * Default tagName
 *
 * @type {String}
 */
View.prototype.tag = 'div';
View.prototype.name = 'noname';

/**
 * Appends the root element
 * to the given parent.
 *
 * @param  {Element} parent
 * @return {View}
 */
View.prototype.appendTo = function(parent) {
  if (!parent) return this;
  parent.appendChild(this.el);
  this.fire('inserted');
  return this;
};

/**
 * Prepends the root element
 * to the given parent.
 *
 * @param  {Element} parent
 * @return {View}
 */
View.prototype.prependTo = function(parent) {
  if (!parent) return this;
  var first = parent.firstChild;

  if (first) parent.insertBefore(this.el, first);
  else this.appendTo(parent);

  this.fire('inserted');
  return this;
};

/**
 * Convenient shorthand
 * querySelector.
 *
 * @param  {String} query
 * @return { Element | null}
 */
View.prototype.find = function(query) {
  return this.el.querySelector(query);
};

/**
 * Removes the element from
 * its current DOM location.
 *
 * @param  {Object} options
 * @return {View}
 */
View.prototype.remove = function(options) {
  var silent = options && options.silent;
  var parent = this.el.parentNode;
  if (!parent) return this;
  parent.removeChild(this.el);
  if (!silent) this.fire('remove');
  return this;
};

View.prototype.set = function(key, value) {
  value = value === undefined ? '' : value;
  this.el.setAttribute(toDashed(key), value);
};

View.prototype.get = function(key) {
  return this.el.getAttribute(key);
};

/**
 * Returns a function that when called
 * will .set() the given key.
 *
 * If a value is passed to .setter(),
 * that value will always be used
 * when the returned function is called.
 * Else the value passed to the given
 * function will be used.
 *
 * Example:
 *
 * var setter = this.setter('key', 'value');
 * setter(); //=> this.set('key', 'value');
 * setter('value2'); //=> this.set('key', 'value');
 *
 * var setter = this.setter('key');
 * setter('value'); //=> this.set('key', 'value');
 * setter(); //=> this.set('key');
 *
 * @param  {String} key
 * @param  {*} value
 * @return {Function}
 */
View.prototype.setter = function(key, forced) {
  var self = this;
  return function(passed) {
    var value = forced !== undefined ? forced : passed;
    self.set(key, value);
  };
};

View.prototype.enable = function(key, value) {
  switch(arguments.length) {
    case 0:
      value = true;
      key = 'enabled';
      break;
    case 1:
      if (typeof key === 'boolean') {
        value = key;
        key = 'enabled';
      } else {
        value = true;
        key = key ? key + '-enabled' : 'enabled';
      }
      break;
    default:
      key = key ? key + '-enabled' : 'enabled';
  }
  this.set(key, !!value);
};

View.prototype.disable = function(key) {
  this.enable(key, false);
};

View.prototype.enabler = function(key) {
  return (function(value) { this.enable(key, value); }).bind(this);
};

View.prototype.hide = function(key) {
  this.toggle(key, false);
};

View.prototype.show =  function(key) {
  this.toggle(key, true);
};

View.prototype.toggle = function(key, value) {
  if (arguments.length === 1 && typeof key === 'boolean') {
    value = key;
    key = '';
  } else {
    key = key ? key + '-' : '';
  }

  this.el.classList.toggle(key + 'hidden', !value);
  this.el.classList.toggle(key + 'visible', value);
};

/**
 * Removes the element from
 * it's current context, firing
 * a 'destroy' event to allow
 * views to perform cleanup.
 *
 * Then clears any internal
 * references to aid GC.
 *
 * @return {[type]} [description]
 */
View.prototype.destroy = function(options) {
  var noRemove = options && options.noRemove;
  if (!noRemove) this.remove();
  this.fire('destroy');
  this.el = null;
};

View.prototype.toString = function() {
  return '[object View]';
};

// Overwrite as required
View.prototype.initialize = noop;
View.prototype.template = function() { return ''; };

/**
 * Extends the base view
 * class with the given
 * properties.
 *
 * TODO: Pull this out to
 * standalone module.
 *
 * @param  {Object} properties
 * @return {Function}
 */
View.extend = function(props) {
  var Parent = this;

  // The extended constructor
  // calls the parent constructor
  var Child = function() {
    Parent.apply(this, arguments);
  };

  Child.prototype = Object.create(Parent.prototype);
  Child.extend = View.extend;
  mixin(Child.prototype, props);

  return Child;
};

function toDashed(s) {
  return s.replace(/\W+/g, '-')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function mixin(a, b) {
  for (var key in b) { a[key] = b[key]; }
  return a;
}

function bindAll(object) {
  var key;
  var fn;
  for (key in object) {
    fn = object[key];
    if (typeof fn === 'function') {
      object[key] = fn.bind(object);
    }
  }
}

});})((function(n,w){return typeof define=='function'&&define.amd?
define:typeof module=='object'?function(c){c(require,exports,module);}:function(c){
var m={exports:{}},r=function(n){return w[n];};w[n]=c(r,m.exports,m)||m.exports;};})('view',this));
define('views/notification',['require','exports','module','lib/mixin','view'],function(require, exports, module) {


/**
* Dependencies
*/

var mix = require('lib/mixin');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name:'notification',
  tag: 'ul',
  time: 3000,

  initialize: function() {
    this.counter = 0;
    this.hash = {};
    // For accessibility purposes list/listitem semantics is not necessary.
    // Instead notifications are presented as status ARIA live regions.
    this.el.setAttribute('role', 'presentation');
  },

  /**
   * Display a new notification.
   *
   * Options:
   *
   *   - `text {String}`
   *   - `className {String}`
   *   - `persistent {Boolean}`
   *
   * @param  {Object} options
   * @return {Number} id for clearing
   * @public
   */
  display: function(options) {
    var item = mix({}, options);
    var id = ++this.counter;
    var self = this;

    item.el = document.createElement('li');
    item.el.className = options.className || '';
    item.el.innerHTML = '<span>' + options.text + '</span>';
    if (options.attrs) { this.setAttributes(item.el, options.attrs); }
    // Notification should have the semantics of the status ARIA live region.
    item.el.setAttribute('role', 'status');
    // Making notfication assertive, so it is spoken right away and not queued.
    item.el.setAttribute('aria-live', 'assertive');
    this.el.appendChild(item.el);

    // Remove last temporary
    // notification in the way
    this.clear(this.temporary);

    // Remove non-persistent
    // messages after 3s
    if (!item.persistent) {
      this.temporary = id;
      this.hide(this.persistent);
      item.clearTimeout = setTimeout(function() {
        self.clear(id);
      }, this.time);
    }

    // Remove previous persistent
    if (item.persistent) {
      this.clear(this.persistent);
      this.persistent = id;
    }

    // Store and return
    this.hash[id] = item;
    return id;
  },

  setAttributes: function(el, attrs) {
    for (var key in attrs) { el.setAttribute(key, attrs[key]); }
  },

  /**
   * Clear notfication by id.
   *
   * Remove the notification from the DOM,
   * clear any existing `clearTimeout` that
   * may have been installed on creation.
   *
   * @param  {Number} item
   * @public
   */
  clear: function(id) {
    var item = this.hash[id];
    if (!item || item.cleared) { return; }

    this.el.removeChild(item.el);
    clearTimeout(item.clearTimeout);
    item.cleared = true;

    // Clear references
    if (item === this.temporary) { this.temporary = null; }
    if (item === this.persistent) { this.persistent = null; }
    delete this.hash[id];

    // Show persistent notification
    // (if there still is one)
    this.show(this.persistent);
  },

  /**
   * Hide a notification.
   *
   * @param  {Number} id
   * @private
   */
  hide: function(id) {
    var item = this.hash[id];
    if (!item) { return; }
    item.el.classList.add('hidden');
  },

  /**
   * Show a hidden notification.
   *
   * @param  {Number} id
   * @private
   */
  show: function(id) {
    var item = this.hash[id];
    if (!item) { return; }
    item.el.classList.remove('hidden');
  }
});

});
define('views/loading-screen',['require','exports','module','debug','view'],function(require, exports, module) {


var debug = require('debug')('view:loading-screen');
var View = require('view');

module.exports = View.extend({
  name: 'loading-screen',
  fadeTime: 300,

  initialize: function() {
    this.render();
  },

  render: function() {
    this.el.innerHTML = this.template;

    // Clean up
    delete this.template;

    debug('rendered');
    return this;
  },

  show: function(done) {
    this.reflow = this.el.offsetTop;
    View.prototype.show.call(this);
  },

  hide: function(done) {
    View.prototype.hide.call(this);
    if (done) { setTimeout(done, this.fadeTime); }
  },

  template: '<progress></progress>'
});

});
define('lib/all-done',['require','exports','module'],function(require, exports, module) {


module.exports = allDone;

function allDone() {
  var counter = 0;
  var master = function() {};
  var decrement = function() {
    if (--counter === 0) {
      master();
    }
  };

  return function done(callback) {
    if (callback) {
      master = callback;
      return done;
    }
    counter++;
    return decrement;
  };
}

});

define('lib/bind',['require','exports','module'],function(require, exports, module) {


/**
 * Exports
 */

exports = module.exports = bind;

/**
 * addEventListener shorthand.
 * @param  {Element}   el
 * @param  {String}   name
 * @param  {Function} fn
 */
function bind(el, name, fn, capture) {
  el.addEventListener(name, fn, capture || false);
}

/**
 * removeEventListener shorthand.
 * @param  {Element}   el
 * @param  {String}   name
 * @param  {Function} fn
 */
exports.unbind = function(el, name, fn, capture) {
  el.removeEventListener(name, fn, capture || false);
};

});

define('lib/pinch',['require','exports','module','lib/bind','lib/bind-all','lib/bind','evt'],function(require, exports, module) {


/**
 * Dependencies
 */

var unbind = require('lib/bind').unbind;
var bindAll = require('lib/bind-all');
var bind = require('lib/bind');
var events = require('evt');

/**
 * Mixin event emitter
 */

events(Pinch.prototype);

/**
 * Exports
 */

module.exports = Pinch;

/**
 * Initialize a new `Pinch` interface.
 *
 * @constructor
 */
function Pinch(el) {
  bindAll(this);
  this.attach(el);
}

Pinch.prototype.attach = function(el) {
  this.el = el;

  bind(this.el, 'touchstart', this.onTouchStart);
  bind(window, 'touchmove', this.onTouchMove);
  bind(window, 'touchend', this.onTouchEnd);
};

Pinch.prototype.detach = function() {
  unbind(this.el, 'touchstart', this.onTouchStart);
  unbind(window, 'touchmove', this.onTouchMove);
  unbind(window, 'touchend', this.onTouchEnd);

  this.el = null;
};

Pinch.prototype.enable = function() {
  this.disabled = false;
};

Pinch.prototype.disable = function() {
  this.disabled = true;
};

Pinch.prototype.onTouchStart = function(evt) {
  if (evt.touches.length !== 2 || this.disabled) {
    return;
  }

  this.lastTouchA = evt.touches[0];
  this.lastTouchB = evt.touches[1];
  this.isPinching = true;
  this.emit('started');
};

Pinch.prototype.onTouchMove = function(evt) {
  if (!this.isPinching || this.disabled) {
    return;
  }

  var touchA = getNewTouchA(this, evt.touches);
  var touchB = getNewTouchB(this, evt.touches);
  var deltaPinch = getDeltaPinch(this, touchA, touchB);

  this.emit('changed', deltaPinch);

  this.lastTouchA = touchA;
  this.lastTouchB = touchB;
};

Pinch.prototype.onTouchEnd = function(evt) {
  if (!this.isPinching || this.disabled) {
    return;
  }

  if (evt.touches.length < 2) {
    this.isPinching = false;
    this.emit('ended');
  }
};

function getNewTouchA(pinch, touches) {
  if (!pinch.lastTouchA) {
    return null;
  }

  for (var i = 0, length = touches.length, touch; i < length; i++) {
    touch = touches[i];
    if (touch.identifier === pinch.lastTouchA.identifier) {
      return touch;
    }
  }
  return null;
}

function getNewTouchB(pinch, touches) {
  if (!pinch.lastTouchB) {
    return null;
  }

  for (var i = 0, length = touches.length, touch; i < length; i++) {
    touch = touches[i];
    if (touch.identifier === pinch.lastTouchB.identifier) {
      return touch;
    }
  }
  return null;
}

function getDeltaPinch(pinch, touchA, touchB) {
  var lastTouchA = pinch.lastTouchA;
  var lastTouchB = pinch.lastTouchB;
  if (!touchA || !lastTouchA || !touchB || !lastTouchB) {
    return 0;
  }

  var oldDistance = Math.sqrt(
    Math.pow(lastTouchB.pageX - lastTouchA.pageX, 2) +
    Math.pow(lastTouchB.pageY - lastTouchA.pageY, 2));
  var newDistance = Math.sqrt(
    Math.pow(touchB.pageX - touchA.pageX, 2) +
    Math.pow(touchB.pageY - touchA.pageY, 2));
  return newDistance - oldDistance;
}

});

define('app',['require','exports','module','performance-testing-helper','stop-recording-event','views/notification','views/loading-screen','lib/orientation','lib/bind-all','lib/all-done','debug','lib/pinch','lib/bind','model'],function(require, exports, module) {


// For perf-measurement related utilities
require('performance-testing-helper');

/**
 * Dependencies
 */

var stopRecordingEvent = require('stop-recording-event');
var NotificationView = require('views/notification');
var LoadingView = require('views/loading-screen');
var orientation = require('lib/orientation');
var bindAll = require('lib/bind-all');
var AllDone = require('lib/all-done');
var debug = require('debug')('app');
var Pinch = require('lib/pinch');
var bind = require('lib/bind');
var model = require('model');

/**
 * Exports
 */

module.exports = App;

/**
 * Mixin `Model` API
 */

model(App.prototype);

/**
 * Initialize a new `App`
 *
 * Options:
 *
 *   - `root` The node to inject content into
 *
 * @param {Object} options
 * @constructor
 */
function App(options) {
  debug('initialize');
  bindAll(this);
  this.views = {};
  this.el = options.el;
  this.win = options.win;
  this.doc = options.doc;
  this.perf = options.perf || {};
  this.pinch = options.pinch || new Pinch(this.el); // Test hook
  this.require = options.require || window.requirejs; // Test hook
  this.LoadingView = options.LoadingView || LoadingView; // test hook
  this.orientation = options.orientation || orientation; // test hook
  this.inSecureMode = (this.win.location.hash === '#secure');
  this.controllers = options.controllers;
  this.geolocation = options.geolocation;
  this.settings = options.settings;
  this.camera = options.camera;
  this.activity = {};
  this.sounds = options.sounds;
  debug('initialized');
}

/**
 * Runs all the methods to boot the app.
 *
 * The loading screen is shown until the
 * camera is 'ready', then it is taken down.
 *
 * @public
 */
App.prototype.boot = function() {
  debug('boot');
  if (this.booted) { return; }
  this.showSpinner('requestingCamera');
  this.bindEvents();
  this.initializeViews();
  this.runControllers();

  // PERFORMANCE EVENT (1): moz-chrome-dom-loaded
  // Designates that the app's *core* chrome or navigation interface
  // exists in the DOM and is marked as ready to be displayed.
  // PERFORMANCE EVENT (2): moz-chrome-interactive
  // Designates that the app's *core* chrome or navigation interface
  // has its events bound and is ready for user interaction.
  window.performance.mark('navigationLoaded');
  this.dispatchEvent('moz-chrome-dom-loaded');
  window.performance.mark('navigationInteractive');
  this.dispatchEvent('moz-chrome-interactive');

  this.injectViews();
  this.booted = true;
  debug('booted');
};

App.prototype.dispatchEvent = function(name) {
  this.win.dispatchEvent(new CustomEvent(name));
};

/**
 * Runs controllers to glue all
 * the parts of the app together.
 *
 * @private
 */
App.prototype.runControllers = function() {
  debug('run controllers');
  this.controllers.overlay(this);
  this.controllers.battery(this);
  this.controllers.settings(this);
  this.controllers.activity(this);
  this.controllers.camera(this);
  this.controllers.viewfinder(this);
  this.controllers.hud(this);
  this.controllers.controls(this);
  debug('controllers run');
};

/**
 * Load and run all the lazy controllers.
 *
 * @param  {Function} done
 */
App.prototype.loadLazyControllers = function(done) {
  debug('load lazy controllers');
  var self = this;
  this.require(this.controllers.lazy, function() {
    [].forEach.call(arguments, function(controller) { controller(self); });
    debug('controllers loaded');
    done();
  });
};

/**
 * Initialize views.
 *
 * @private
 */
App.prototype.initializeViews = function() {
  debug('initializing views');
  this.views.notification = new NotificationView();
  debug('views initialized');
};

/**
 * Put views in the DOM.
 *
 * @private
 */
App.prototype.injectViews = function() {
  debug('injecting views');
  this.views.notification.appendTo(this.el);
  debug('views injected');
};

/**
 * Attaches event handlers.
 *
 * @private
 */
App.prototype.bindEvents = function() {
  debug('binding events');

  // App
  this.once('storage:checked:healthy', this.geolocationWatch);
  this.once('viewfinder:visible', this.onCriticalPathDone);
  this.once('camera:error', this.onCriticalPathDone);
  this.on('camera:willchange', this.firer('busy'));
  this.on('ready', this.clearSpinner);
  this.on('visible', this.onVisible);
  this.on('hidden', this.onHidden);
  this.on('reboot', this.onReboot);
  this.on('busy', this.onBusy);

  // Pinch
  this.pinch.on('changed', this.firer('pinch:changed'));
  this.on('previewgallery:opened', this.pinch.disable);
  this.on('previewgallery:closed', this.pinch.enable);
  this.on('settings:opened', this.pinch.disable);
  this.on('settings:closed', this.pinch.enable);

  // DOM
  bind(this.doc, 'visibilitychange', this.onVisibilityChange);

  // we bind to window.onlocalized in order not to depend
  // on l10n.js loading (which is lazy). See bug 999132
  bind(this.win, 'localized', this.firer('localized'));

  bind(this.win, 'beforeunload', this.onBeforeUnload);
  bind(this.win, 'keydown', this.onKeyDown);
  bind(this.el, 'click', this.onClick);
  debug('events bound');
};

/**
 * Tasks to run when the
 * app becomes visible.
 *
 * Check the storage again as users
 * may have made changes since the
 * app was minimised
 */
App.prototype.onVisible = function() {
  this.geolocationWatch();
  this.orientation.start();
  this.orientation.lock();
  debug('visible');
};

/**
 * Tasks to run when the
 * app is minimised/hidden.
 *
 * @private
 */
App.prototype.onHidden = function() {
  this.geolocation.stopWatching();
  this.orientation.stop();
  debug('hidden');
};


/**
 * Reboots the application
 *
 * @private
 */
App.prototype.onReboot = function() {
  debug('reboot');
  window.location.reload();
};


/**
 * Emit a click event that other
 * modules can listen to.
 *
 * @private
 */
App.prototype.onClick = function() {
  debug('click');
  this.emit('click');
};

/**
 * Log when critical path has completed.
 *
 * @private
 */
App.prototype.onCriticalPathDone = function() {
  if (this.criticalPathDone) { return; }
  debug('critical path done');
  // PERFORMANCE EVENT (3): moz-app-visually-complete
  // Designates that the app is visually loaded (e.g.: all of the
  // "above-the-fold" content exists in the DOM and is marked as
  // ready to be displayed).
  window.performance.mark('visuallyLoaded');
  this.dispatchEvent('moz-app-visually-complete');

  // Load non-critical modules
  this.listenForStopRecordingEvent();
  this.loadLazyModules();
  this.perf.criticalPath = Date.now();
  this.criticalPathDone = true;
  this.emit('criticalpathdone');
};

App.prototype.loadLazyModules = function() {
  debug('load lazy modules');
  var done = AllDone();
  var self = this;

  this.loadL10n(done());
  this.loadLazyControllers(done());
  this.once('storage:checked', done());

  // All done
  done(function() {
    debug('app fully loaded');

    // PERFORMANCE EVENT (4): moz-content-interactive
    // Designates that the app has its events bound for the minimum
    // set of functionality to allow the user to interact with the
    // "above-the-fold" content.
    window.performance.mark('contentInteractive');
    self.dispatchEvent('moz-content-interactive');

    // PERFORMANCE EVENT (5): moz-app-loaded
    // Designates that the app is *completely* loaded and all relevant
    // "below-the-fold" content exists in the DOM, is marked visible,
    // has its events bound and is ready for user interaction. All
    // required startup background processing should be complete.
    window.performance.mark('fullyLoaded');
    self.dispatchEvent('moz-app-loaded');
    self.perf.loaded = Date.now();
    self.loaded = true;
    self.emit('loaded');
    self.logPerf();
  });
};

App.prototype.logPerf =function() {
  var timing = window.performance.timing;
  console.log('domloaded: %s',
    timing.domComplete - timing.domLoading + 'ms');
  console.log('first module: %s',
    this.perf.firstModule - this.perf.jsStarted + 'ms');
  console.log('critical-path: %s',
    this.perf.criticalPath -  timing.domLoading + 'ms');
  console.log('app-fully-loaded: %s',
    this.perf.loaded - timing.domLoading + 'ms');
};

/**
 * Begins watching location if not within
 * a pending activity and the app isn't
 * currently hidden.
 *
 * Watching is delayed by the `promptDelay`
 * defined in settings.
 *
 * @private
 */
App.prototype.geolocationWatch = function() {
  var shouldWatch = !this.activity.pick && !this.hidden;
  if (shouldWatch) { this.geolocation.watch(); }
};

/**
 * Responds to the `visibilitychange`
 * event, emitting useful app events
 * that allow us to perform relate
 * work elsewhere.
 *
 * @private
 */
App.prototype.onVisibilityChange = function() {
  this.hidden = this.doc.hidden;
  this.emit(this.hidden ? 'hidden' : 'visible');
};

/**
 * Runs just before the
 * app is destroyed.
 *
 * @private
 */
App.prototype.onBeforeUnload = function() {
  this.emit('beforeunload');
  debug('beforeunload');
};

/**
 * Initialize l10n 'localized' listener.
 *
 * Sometimes it may have completed
 * before we reach this point, meaning
 * we will have missed the 'localized'
 * event. In this case, we emit the
 * 'localized' event manually.
 *
 * @private
 */
App.prototype.loadL10n = function(done) {
  this.require(['l10n'], done);
};

/**
 * States whether localization
 * has completed or not.
 *
 * @return {Boolean}
 * @public
 */
App.prototype.localized = function() {
  var l10n = navigator.mozL10n;
  return l10n && l10n.readyState === 'complete';
};

/**
 * Central place to localize a string.
 *
 * @param  {String} key
 * @public
 */
App.prototype.l10nGet = function(key) {
  var l10n = navigator.mozL10n;
  if (l10n) {
    return l10n.get(key);
  }

  // in case we don't have mozL10n loaded yet, we want to
  // return the key. See bug 999132
  return key;
};

/**
 * Shows the loading screen after the
 * number of ms defined in config.js
 *
 * @param {String} type
 * @private
 */
App.prototype.showSpinner = function(key) {
  debug('show loading type: %s', key);

  var view = this.views.loading;
  if (view) {
    return;
  }

  var ms = this.settings.spinnerTimeouts.get(key) || 0;
  var self = this;

  clearTimeout(this.spinnerTimeout);
  this.spinnerTimeout = setTimeout(function() {
    self.views.loading = new self.LoadingView();
    self.views.loading.appendTo(self.el).show();
    debug('loading shown');
  }, ms);
};

/**
 * Clears the loadings screen, or
 * any pending loading screen.
 *
 * @private
 */
App.prototype.clearSpinner = function() {
  debug('clear loading');
  var view = this.views.loading;
  clearTimeout(this.spinnerTimeout);
  if (!view) { return; }
  view.hide(view.destroy);
  this.views.loading = null;
};

/**
 * When the camera indicates it's busy it
 * sometimes passes a `type` string. When
 * this type matches one of our keys in the
 * `spinnerTimeouts` config, we display the
 * loading screen passing on the type.
 *
 * @param  {String} type
 * @private
 */
App.prototype.onBusy = function(type) {
  debug('camera busy, type: %s', type);
  var delay = this.settings.spinnerTimeouts.get(type);
  if (delay) { this.showSpinner(type); }
};

/**
 * Clears the loadings screen, or
 * any pending loading screen.
 *
 * @private
 */
App.prototype.onReady = function() {
  debug('ready');
  var view = this.views.loading;
  clearTimeout(this.spinnerTimeout);
  if (!view) { return; }
  view.hide(view.destroy);
  this.views.loading = null;
};

/**
 * If the system app is opening an attention screen (because
 * of an incoming call or an alarm, e.g.) and if we are
 * currently recording a video then we need to stop recording
 * before the ringer or alarm starts sounding. We will be sent
 * to the background shortly after this and will stop recording
 * when that happens, but by that time it is too late and we
 * have already recorded some sound. See bugs 995540 and 1006200.
 *
 * Similarly, if the user presses the Home button or switches to
 * another app while recording, we need to stop recording right away,
 * even if the system is overloaded and we don't get a visiblitychange
 * event right away. See bug 1046167.
 *
 * To make this work, we rely on shared/js/stop_recording_event.js which
 * abuses the settings API to allow the system app to broadcast a "you
 * will soon be hidden" message to any certified apps that care. There
 * ought to be a better way, but this is a quick way to fix a
 * last-minute release blocker.
 *
 * @private
 */
App.prototype.listenForStopRecordingEvent = function() {
  debug('listen for stop recording events');

  // Start the module that generates
  // the stoprecording events and listen
  // for those custom DOM events and emit
  // them using our internal event emitter
  stopRecordingEvent.start();
  addEventListener('stoprecording', this.firer('stoprecording'));
};


/**
 * When the device's hardware keys
 * are pressed we emit a global
 * app event that other controllers
 * can respond to.
 *
 * TIP: Check config.js for the map
 * of key names to types.
 *
 * @param  {Event} e
 * @private
 */
App.prototype.onKeyDown = function(e) {
  var key = e.key.toLowerCase();
  var type = this.settings.keyDownEvents.get(key);
  if (type) { this.emit('keydown:' + type, e); }
};


});

define('views/overlay',['require','exports','module','debug','view','lib/bind'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:overlay');
var View = require('view');
var bind = require('lib/bind');

/**
 * Exports
 */

module.exports = View.extend({
  className: 'overlay',

  initialize: function(options) {
    this.data('type', options.type);
    this.data('closable', options.closable);
    this.render(options.data);
  },

  render: function(data) {

    // Inject HTML
    this.el.innerHTML = this.template(data);

    // Pick out elements
    this.els.buttons = {
      close: this.find('.js-close-btn')
    };

    // Clean up
    delete this.template;

    debug('rendered');
    return this.bindEvents();
  },

  bindEvents: function() {
    bind(this.els.buttons.close, 'click', this.onButtonClick);
    return this;
  },

  template: function(data) {
    /*jshint maxlen:false*/
    return '<form role="dialog" data-type="confirm">' +
      '<section>' +
        '<h1 class="overlay-title">' + data.title + '</h1>' +
        '<p id="overlay-text">' + data.body + '</p>' +
      '</section>' +
      '<menu class="overlay-menu-close">' +
        '<button class="full js-close-btn" type="button" name="close-btn">' +
        data.closeButtonText + '</button>' +
      '</menu>' +
    '</form>';
  },

  data: function(key, value) {
    switch (arguments.length) {
      case 1: return this.el.getAttribute('data-' + key);
      case 2: this.el.setAttribute('data-' + key, value);
    }
  },

  onButtonClick: function(event) {
    var el = event.currentTarget;
    var name = el.getAttribute('name');
    this.emit('click:' + name);
  }
});

});

define('controllers/overlay',['require','exports','module','debug','views/overlay','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:overlay');
var Overlay = require('views/overlay');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new OverlayController(app); };
module.exports.OverlayController = OverlayController;

/**
 * Initialize a new `OverlayController`
 *
 * @param {App} app
 */
function OverlayController(app) {
  bindAll(this);
  this.app = app;
  this.activity = app.activity;
  this.l10nGet = app.l10nGet;
  this.batteryOverlay = null;
  this.storageOverlay = null;
  this.bindEvents();
  debug('initialized');
}

OverlayController.prototype.bindEvents = function() {
  this.app.on('storage:changed', this.onStorageChanged);
  this.app.on('change:batteryStatus', this.onBatteryChanged);
  this.app.on('camera:requesting', this.onCameraRequesting);
  this.app.on('camera:error', this.onCameraError);
};

/**
 * Respond to storage `statechange`
 * events by inserting or destroying
 * overlays from the app.
 *
 * @param  {String} value  ['nospace'|'shared'|'unavailable'|'available']
 */
OverlayController.prototype.onStorageChanged = function(state) {
  var self = this;
  debug('storage changed: \'%s\'', state);

  if (this.storageOverlay) {
    this.storageOverlay.destroy();
    this.storageOverlay = null;
  }

  if (state !== 'available') {
    this.createOverlay(state, onOverlayCreated);
  }

  function onOverlayCreated(overlay) {
    self.storageOverlay = overlay;
  }
};

/**
 * Respond to battery `statuschange`
 * events by inserting or destroying
 * overlays from the app.
 *
 * @param  {String} status  ['shutdown'|'critical'|'verylow'|'low']
 */
OverlayController.prototype.onBatteryChanged = function(state) {
  var self = this;
  debug('battery state change: \'%s\'', state);

  if (this.batteryOverlay) {
    this.batteryOverlay.destroy();
    this.batteryOverlay = null;
  }

  if (state === 'shutdown') {
    this.createOverlay(state, onOverlayCreated);
  }

  function onOverlayCreated(overlay) {
    self.batteryOverlay = overlay;
  }
};

/**
 * Respond to camera `requesting`
 * events by destroying overlays
 * from the app.
 *
 * @param  {String} state  ['start'|'success'|'fail']
 */
OverlayController.prototype.onCameraRequesting = function() {
  if (this.cameraErrorOverlay) {
    this.cameraErrorOverlay.destroy();
    this.cameraErrorOverlay = null;
  }
};

/**
 * Respond to camera `error`
 * events by inserting overlays
 * into the app.
 *
 * @param  {String} state  ['start'|'success'|'fail']
 */
OverlayController.prototype.onCameraError = function(type) {
  var self = this;
  debug('camera error type: \'%s\'', type);

  this.createOverlay(type, onOverlayCreated);

  function onOverlayCreated(overlay) {
    self.cameraErrorOverlay = overlay;
  }
};

OverlayController.prototype.createOverlay = function(type, callback) {
  var self = this;
  if (!this.app.localized()) {
    this.app.showSpinner();
    this.app.on('localized', onLocalized);
    return;
  }

  function onLocalized() {
    self.app.clearSpinner();
    self.createOverlay(type, callback);
  }

  var data = this.getOverlayData(type);
  if (!data) {
    if (typeof callback === 'function') {
      callback(null);
    }
    return;
  }

  var closable = this.activity.pick && type !== 'request-fail';

  var overlay = new Overlay({
    type: type,
    closable: closable,
    data: data
  }).appendTo(document.body)
    .on('click:close-btn', function() {
      self.app.emit('activitycanceled');
    });

  debug('inserted \'%s\' overlay', type);

  if (typeof callback === 'function') {
    callback(overlay);
  }
};

/**
 * Get the overlay data required
 * to render a specific type of overlay.
 *
 * @param  {String} type
 * @return {Object}
 */
OverlayController.prototype.getOverlayData = function(type) {
  var data = {};

  switch (type) {
    case 'unavailable':
      data.title = this.l10nGet('nocard2-title');
      data.body = this.l10nGet('nocard3-text');
    break;
    case 'nospace':
      data.title = this.l10nGet('nospace2-title');
      data.body = this.l10nGet('nospace2-text');
    break;
    case 'shared':
      data.title = this.l10nGet('pluggedin2-title');
      data.body = this.l10nGet('pluggedin2-text');
    break;
    case 'shutdown':
      data.title = this.l10nGet('battery-shutdown-title');
      data.body = this.l10nGet('battery-shutdown-text');
    break;
    case 'request-fail':
      data.title = this.l10nGet('camera-unavailable-title');
      data.body = this.l10nGet('camera-unavailable-text');
    break;
    default:
      return false;
  }

  data.closeButtonText = this.l10nGet('close-button');

  return data;
};

});

define('controllers/battery',['require','exports','module','debug','lib/bind-all','lib/bind'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:battery');
var bindAll = require('lib/bind-all');
var bind = require('lib/bind');

/**
 * Exports
 */

module.exports = function(app) { return new BatteryController(app); };
module.exports.BatteryController = BatteryController;

/**
 * Initialize a new `BatteryController`
 *
 * @param {Object} options
 */
function BatteryController(app) {
  bindAll(this);
  this.app = app;
  this.battery = app.battery || navigator.battery || navigator.mozBattery;
  this.levels = app.settings.battery.get('levels');
  this.notification = app.views.notification;
  this.l10nGet = app.l10nGet;
  this.bindEvents();
  this.updateStatus();
  debug('initialized');
}

/**
 * Bind callbacks to required events.
 *
 * @private
 */
BatteryController.prototype.bindEvents = function() {
  bind(this.battery, 'levelchange', this.updateStatus);
  bind(this.battery, 'chargingchange', this.updateStatus);
  this.app.on('change:batteryStatus', this.onStatusChange);
};

/**
 * Map of status keys to message.
 *
 * @type {Object}
 * @private
 */
BatteryController.prototype.notifications = {
  low: {
    text: 'battery-low-text',
    attrs: { 'data-icon': 'battery-3' }
  },
  verylow: {
    text: 'battery-verylow-text',
    attrs: { 'data-icon': 'battery-1' }
  },
  critical: {
    text: 'battery-critical-text',
    attrs: { 'data-icon': 'battery-1' },
    persistent: true
  }
};

/**
 * Updates app `batteryStatus` and
 * manages battery notifications.
 *
 * @private
 */
BatteryController.prototype.updateStatus = function () {
  var previous = this.app.get('batteryStatus');
  var current = this.getStatus(this.battery);
  // We need the app to be first localized
  // before showing the battery status message
  if (!this.app.localized()) {
    this.app.on('localized', this.updateStatus);
    return;
  }
  if (current !== previous) {
    this.app.set('batteryStatus', current);
  }
};

/**
 * Returns a status key derived
 * from the given `battery` object.
 *
 * @param  {Battery} battery
 * @return {String}
 * @private
 */
BatteryController.prototype.getStatus = function(battery) {
  var level = Math.round(battery.level * 100);
  var levels = this.levels;

  if (battery.charging) { return 'charging'; }
  else if (level <= levels.shutdown) { return 'shutdown'; }
  else if (level <= levels.critical) { return 'critical'; }
  else if (level <= levels.verylow) { return 'verylow'; }
  else if (level <= levels.low) { return 'low'; }
  else { return 'healthy'; }
};

BatteryController.prototype.onStatusChange = function(status) {
  this.clearLastNotification();
  this.displayNotification(status);
};

BatteryController.prototype.displayNotification = function(status) {
  var notification = this.notifications[status];
  if (!notification) { return; }

  this.lastNotification = this.notification.display({
    text: this.l10nGet(notification.text),
    className: notification.className,
    attrs: notification.attrs,
    persistent: notification.persistent
  });
};

BatteryController.prototype.clearLastNotification = function() {
  this.notification.clear(this.lastNotification);
};

});

define('views/hud',['require','exports','module','debug','lib/bind','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:hud');
var bind = require('lib/bind');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'hud',

  initialize: function() {
    this.render();
  },

  render: function() {
    this.el.innerHTML = this.template();
    this.els.flash = this.find('.js-flash');
    this.els.camera = this.find('.js-camera');
    this.els.settings = this.find('.js-settings');

    // Clean up
    delete this.template;

    debug('rendered');
    return this.bindEvents();
  },

  bindEvents: function() {
    bind(this.els.flash, 'click', this.onFlashClick);
    bind(this.els.camera, 'click', this.onCameraClick);
    bind(this.els.settings, 'click', this.onSettingsClick, true);
    return this;
  },

  _setLabel: function(element, mode) {
    if (mode) {
      this.els[element].setAttribute('data-l10n-id', mode.title + '-button');
    } else {
      this.els[element].removeAttribute('data-l10n-id');
      this.els[element].removeAttribute('aria-label');
    }
  },

  setFlashModeLabel: function(mode) {
    this._setLabel('flash', mode);
  },

  setFlashMode: function(mode) {
    if (!mode) { return; }
    this.els.flash.dataset.icon = mode.icon;
    this.setFlashModeLabel(mode);
  },

  setCameraLabel: function(camera) {
    this._setLabel('camera', camera);
  },

  setCamera: function(camera) {
    if (!camera) { return; }
    this.els.camera.dataset.icon = camera.icon;
    this.setCameraLabel(camera);
  },

  setMenuLabel: function() {
    this._setLabel('settings', { title: 'menu' });
  },

  onFlashClick: function(event) {
    event.stopPropagation();
    this.emit('click:flash');
  },

  onCameraClick: function(event) {
    event.stopPropagation();
    this.emit('click:camera');
  },

  onSettingsClick: function(event) {
    event.stopPropagation();
    this.emit('click:settings');
  },

  template: function() {
    return '<div role="button" class="hud_btn hud_camera rotates ' +
      'test-camera-toggle js-camera"></div>' +
    '<div role="button" class="hud_btn hud_flash rotates test-flash-button ' +
      'js-flash"></div>' +
    '<div role="button" class="hud_btn hud_settings rotates ' +
      'test-settings-toggle js-settings" data-icon="menu" ' +
      'data-l10n-id="menu-button"></div>';
  }
});

});

define('controllers/hud',['require','exports','module','debug','lib/debounce','lib/bind-all','views/hud'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:hud');
var debounce = require('lib/debounce');
var bindAll = require('lib/bind-all');
var HudView = require('views/hud');

/**
 * Exports
 */

module.exports = function(app) { return new HudController(app); };
module.exports.HudController = HudController;

/**
 * Initialize a new `HudController`
 *
 * @param {AppController} app
 * @constructor
 *
 */
function HudController(app) {
  bindAll(this);
  this.app = app;
  this.settings = app.settings;
  this.l10nGet = app.l10nGet;
  this.notification = app.views.notification;
  this.createView();
  this.bindEvents();
  debug('initialized');
}

/**
 * Create and configure the HUD view.
 *
 * Disable flash button until we know
 * whether the hardware has flash.
 *
 * @private
 */
HudController.prototype.createView = function() {
  var hasDualCamera = this.settings.cameras.get('options').length > 1;
  this.view = this.app.views.hud || new HudView(); // test hook
  this.view.enable('camera', hasDualCamera);
  this.view.disable('flash');
  this.view.hide();
  this.updateCamera();
  this.view.appendTo(this.app.el);
};

/**
 * Bind callbacks to events.
 *
 * @return {HudController} for chaining
 * @private
 */
HudController.prototype.bindEvents = function() {

  // App
  this.app.on('change:recording', this.view.setter('recording'));
  this.app.on('ready', this.view.setter('camera', 'ready'));
  this.app.on('busy', this.view.setter('camera', 'busy'));

  // We need the app to be first localized before localizing the hud view.
  this.app.on('localized', this.localize);

  // Settings
  this.app.once('settings:configured', this.view.show);
  this.app.on('settings:configured', this.updateFlashSupport);
  this.app.settings.flashModes.on('change:selected', this.updateFlashMode);
  this.app.settings.mode.on('change:selected', this.updateFlashMode);
  this.app.settings.cameras.on('change:selected', this.updateCamera);

  // We 'debouce' some UI callbacks to prevent
  // thrashing the hardware when a user taps repeatedly.
  // This means the first calback will fire instantly but
  // subsequent events will be blocked for given time period.
  this.view.on('click:camera', debounce(this.onCameraClick, 500, true));
  this.view.on('click:settings', this.app.firer('settings:toggle'));
  this.view.on('click:flash', this.onFlashClick);

  // Timer
  this.app.on('timer:cleared', this.view.setter('timer', 'inactive'));
  this.app.on('timer:started', this.view.setter('timer', 'active'));
  this.app.on('timer:ended', this.view.setter('timer', 'inactive'));

  // Settings
  this.app.on('settings:opened', this.view.hide);
  this.app.on('settings:closed', this.view.show);
};

HudController.prototype.onCameraClick = function() {
  debug('camera clicked');
  this.clearNotifications();
  this.app.settings.cameras.next();
};

HudController.prototype.clearNotifications = function() {
  this.notification.clear(this.flashNotification);
};

/**
 * Cycle to the next available flash
 * option, update the HUD view and
 * show a change notification.
 *
 * @private
 */
HudController.prototype.onFlashClick = function() {
  var setting = this.settings.flashModes;
  var ishdrOn = this.settings.hdr.selected('key') === 'on';

  setting.next();
  this.view.set('flashMode' , setting.selected('key'));
  this.notify(setting, ishdrOn);
};

/**
 * Display a notifcation showing the
 * current state of the given setting.
 *
 * @param  {Setting} setting
 * @private
 */
HudController.prototype.notify = function(setting, hdrDeactivated) {
  var optionTitle = this.l10nGet(setting.selected('title'));
  var title = this.l10nGet(setting.get('title'));
  var html;

  // Check if the `hdr` setting is going to be deactivated as part
  // of the change in the `flashMode` setting and display a specialized
  // notification if that is the case
  if (hdrDeactivated) {
    html = title + ' ' + optionTitle + '<br/>' +
      this.l10nGet('hdr-deactivated');
  } else {
    html = title + '<br/>' + optionTitle;
  }

  this.flashNotification = this.notification.display({ text: html });
};

/**
 * Localize hud view when app is localized or locale updated.
 */
HudController.prototype.localize = function() {
  this.view.setFlashModeLabel(this.settings.flashModes.selected());
  this.view.setCameraLabel(this.settings.cameras.selected());
  this.view.setMenuLabel();
};

HudController.prototype.updateFlashMode = function() {
  var selected = this.settings.flashModes.selected();
  if (!selected) { return; }
  this.view.setFlashMode(selected);
  debug('updated flash mode: %s', selected.key);
};

HudController.prototype.updateFlashSupport = function() {
  var supported = this.settings.flashModes.supported();
  this.view.enable('flash', supported);
  this.updateFlashMode();
  debug('flash supported: %s', supported);
};

HudController.prototype.updateCamera = function() {
  var selected = this.settings.cameras.selected();
  if (!selected) { return; }
  this.view.setCamera(selected);
  debug('updated camera: %s', selected.key);
};

});

(function(define){define('drag',['require','exports','module','evt'],function(require,exports,module){
/*globals define*//*jshint node:true*/

/**
 * Dependencies
 */

var events = require('evt');

/**
 * Exports
 */

module.exports = Drag;

/**
 * Mixin Emitter
 */

events(Drag.prototype);

/**
 * Pointer event abstraction to make
 * it work for touch and mouse.
 *
 * @type {Object}
 */
var pointer = [
  { down: 'touchstart', up: 'touchend', move: 'touchmove' },
  { down: 'mousedown', up: 'mouseup', move: 'mousemove' }
]['ontouchstart' in window ? 0 : 1];

/**
 * Drag creates a draggable 'handle' element,
 * constrained within a 'container' element.
 *
 * Drag instances emit useful events and provides
 * methods to support common draggable UI use-cases,
 * like `snapToClosestEdge`
 *
 * In Gaia we use `Drag` for our switch components.
 *
 * Usage:
 *
 *   // Create a new `Drag`
 *   var drag = new Drag({
 *     container: myContainer,
 *     handle: myHandle
 *   });
 *
 *   // Once elements are in the DOM we
 *   // need to take some measurements
 *   drag.updateDimensions();
 *
 * Options:
 *
 *   - {Element} `container`
 *   - {Element} `handle`
 *
 * @param {Object} options
 */
function Drag(options) {
  this.container = { el: options.container };
  this.handle = { el: options.handle };
  this.onTouchStart = this.onTouchStart.bind(this);
  this.onTouchMove = this.onTouchMove.bind(this);
  this.onTouchEnd = this.onTouchEnd.bind(this);
  this.slideDuration = options.slideDuration || 140;
  this.tapTime = options.tapTime || 180;
  this.bindEvents();
}

Drag.prototype.bindEvents = function() {
  this.container.el.addEventListener(pointer.down, this.onTouchStart);
};

Drag.prototype.onTouchStart = function(e) {
  this.updateDimensions();
  this.touch = ~e.type.indexOf('mouse') ? e : e.touches[0];
  this.firstTouch = this.touch;
  this.startTime = e.timeStamp;

  addEventListener(pointer.move, this.onTouchMove);
  addEventListener(pointer.up, this.onTouchEnd);
};

Drag.prototype.onTouchMove = function(e) {
  e.preventDefault();
  e = ~e.type.indexOf('mouse') ? e : e.touches[0];

  var delta = {
    x: e.clientX - this.touch.clientX,
    y: e.clientY - this.touch.clientY
  };

  this.dragging = true;
  this.move(delta);
  this.touch = e;
};

Drag.prototype.onTouchEnd = function(e) {
  var tapped = (e.timeStamp - this.startTime) < this.tapTime;
  this.dragging = false;

  removeEventListener(pointer.move, this.onTouchMove);
  removeEventListener(pointer.up, this.onTouchEnd);

  if (tapped) { this.emit('tapped', e); }
  else { this.emit('ended', e); }
};

Drag.prototype.move = function(delta) {
  this.translate({
    x: this.handle.position.x + delta.x,
    y: this.handle.position.y + delta.y
  });
};

Drag.prototype.set = function(pos) {
  if (!this.edges) { this.pendingSet = pos; return; }
  var x = typeof pos.x === 'string' ? this.edges[pos.x] : (pos.x || 0);
  var y = typeof pos.y === 'string' ? this.edges[pos.y] : (pos.y || 0);
  this.translate({ x: x, y: y });
};

Drag.prototype.snapToClosestEdge = function() {
  var edges = this.getClosestEdges();

  this.translate({
    x: this.edges[edges.x],
    y: this.edges[edges.y]
  });

  this.emit('snapped', edges);
};

Drag.prototype.translate = function(options) {
  var position = this.clamp(options);
  var translate = 'translate(' + position.x + 'px,' + position.y + 'px)';
  var ratio = {
    x: (position.x / this.max.x) || 0,
    y: (position.y / this.max.y) || 0
  };

  this.setTransition(position);

  // Set the transform to move the handle
  this.handle.el.style.transform = translate;

  // Update the handle position reference
  this.handle.position = position;

  // Emit event with useful data
  this.emit('translate', {
    position: {
      px: position,
      ratio: ratio
    }
  });
};

Drag.prototype.clamp = function(position) {
  return {
    x: Math.max(this.min.x, Math.min(this.max.x, position.x)),
    y: Math.max(this.min.y, Math.min(this.max.y, position.y)),
  };
};

/**
 * [setTransition description]
 * @param {[type]} position [description]
 */
Drag.prototype.setTransition = function(position) {
  var duration = !this.dragging ? this.transitionDuration(position) : 0;
  this.handle.el.style.transitionDuration = duration + 'ms';
};

Drag.prototype.transitionDuration = function(position) {
  var current = this.handle.position;
  var distanceX = Math.abs(current.x - position.x);
  var distanceY = Math.abs(current.y - position.y);
  var distance = Math.max(distanceX, distanceY);
  var axis = distanceY > distanceX ? 'y' : 'x';
  var ratio = distance / this.max[axis];
  return this.slideDuration * ratio;
};

Drag.prototype.getClosestEdges = function() {
  return {
    x: this.handle.position.x <= (this.max.x / 2) ?  'left' : 'right',
    y: this.handle.position.y <= (this.max.y / 2) ?  'top' : 'bottom'
  };
};

Drag.prototype.updateDimensions = function() {
  var container = this.container.el.getBoundingClientRect();
  var handle = this.handle.el.getBoundingClientRect();

  this.min = { x: 0, y: 0 };
  this.max = {
    x: container.width - handle.width,
    y: container.height - handle.height
  };

  this.edges = {
    top: this.min.y,
    right: this.max.x,
    bottom: this.max.y,
    left: this.min.x
  };

  this.handle.position = {
    x: handle.left - container.left,
    y: handle.top - container.top
  };

  this.clearPendingSet();
};

Drag.prototype.clearPendingSet = function() {
  if (!this.pendingSet) { return; }
  this.set(this.pendingSet);
  delete this.pendingSet;
};

});})((function(n,w){return typeof define=='function'&&define.amd?
define:typeof module=='object'?function(c){c(require,exports,module);}:
function(c){var m={exports:{}},r=function(n){return w[n];};
w[n]=c(r,m.exports,m)||m.exports;};})('drag',this));
define('views/controls',['require','exports','module','debug','lib/debounce','lib/bind','view','drag'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:controls');
var debounce = require('lib/debounce');
var bind = require('lib/bind');
var View = require('view');
var Drag = require('drag');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'controls',
  className: 'test-controls',

  initialize: function(options) {
    this.drag = options && options.drag; // test hook
    this.once('inserted', this.setupSwitch);
    this.render();
  },

  switchPositions: {
    left: 'picture',
    right: 'video',
    picture: 'left',
    video: 'right'
  },

  render: function() {
    this.el.innerHTML = this.template();

    // Get nodes
    this.els.switchHandle = this.find('.js-switch-handle');
    this.els.thumbnail = this.find('.js-thumbnail');
    this.els.capture = this.find('.js-capture');
    this.els.cancel = this.find('.js-cancel');
    this.els.switch = this.find('.js-switch');
    this.els.icons = {
      camera: this.find('.js-icon-camera'),
      video: this.find('.js-icon-video')
    };

    // Clean up
    delete this.template;

    debug('rendered');
    return this.bindEvents();
  },

  /**
   * Respond to click events on the buttons
   * other than the switch, which is a special
   * case.
   *
   * We 'debouce' the callback to defend
   * against button-bashing.
   *
   * @return {ControlsView} for chaining
   * @private
   */
  bindEvents: function() {
    this.onButtonClick = debounce(this.onButtonClick, 300, true);
    bind(this.els.thumbnail, 'click', this.onButtonClick);
    bind(this.els.capture, 'click', this.onButtonClick);
    bind(this.els.cancel, 'click', this.onButtonClick);
    return this;
  },

  /**
   * Create the draggable switch.
   *
   * We debouce the tapped callback to
   * defend against button-bashing.
   *
   * @private
   */
  setupSwitch: function() {
    debug('setup dragger');

    // Wait until the document is complete
    // to avoid any forced sync reflows.
    if (document.readyState !== 'complete') {
      window.addEventListener('load', this.setupSwitch);
      debug('deferred switch setup till after load');
      return;
    }

    // Prefer existing drag (test hook)
    this.drag = this.drag || new Drag({
      handle: this.els.switchHandle,
      container: this.els.switch
    });

    this.drag.on('tapped', debounce(this.onSwitchTapped, 300, true));
    this.drag.on('ended', this.drag.snapToClosestEdge);
    this.drag.on('translate', this.onSwitchTranslate);
    this.drag.on('snapped', this.onSwitchSnapped);

    this.drag.updateDimensions();
    this.updateSwitchPosition();

    // Tidy up
    window.removeEventListener('load', this.setupSwitch);
  },

  onSwitchSnapped: function(edges) {
    var mode = this.switchPositions[edges.x];
    var changed = mode !== this.get('mode');
    if (changed) { this.onSwitchChanged(); }
  },

  onSwitchChanged: function() {
    this.emit('modechanged');
  },

  onSwitchTapped: function(e) {
    e.preventDefault();
    e.stopPropagation();
    debug('switch tapped');
    this.onSwitchChanged();
  },

  onSwitchTranslate: function(e) {
    this.setSwitchIcon(e.position.ratio.x);
  },

  setSwitchIcon: function(ratio) {
    var skew = 2;
    var ratioSkewed = ratio * skew;
    var camera = Math.max(0, 1 - ratioSkewed);
    var video = Math.max(0, -1 + ratioSkewed);
    this.els.icons.camera.style.opacity = camera;
    this.els.icons.video.style.opacity = video;
    debug('set switch icon camera: %s, video: %s', camera, video);
  },

  /**
   * Set view screen reader visibility. In some cases, though the view is behind
   * an overlay and not hidden off screen, it still needs to be
   * hidden/inaccessible from the screen reader.
   */
  setScreenReaderVisible: function(visible) {
    this.el.setAttribute('aria-hidden', !visible);
  },

  onButtonClick: function(e) {
    e.stopPropagation();
    debug('button click');
    var name = e.currentTarget.getAttribute('name');
    this.emit('click:' + name, e);
  },

  setMode: function(mode) {
    debug('set mode: %s', mode);
    this.set('mode', mode);
    this.switchPosition = this.switchPositions[mode];
    var ratio = { left: 0, right: 1 }[this.switchPosition];
    this.updateSwitchPosition();
    this.setSwitchIcon(ratio);
    debug('mode set pos: %s', this.switchPosition);
  },

  updateSwitchPosition: function() {
    debug('updateSwitchPosition');
    if (!this.drag) { return; }
    this.drag.set({ x: this.switchPosition });
    debug('updated switch position: %s', this.switchPosition);
  },

  setThumbnail: function(blob) {
    if (!this.els.image) {
      this.els.image = new Image();
      this.els.image.classList.add('test-thumbnail');
      this.els.thumbnail.appendChild(this.els.image);
      this.set('thumbnail', true);
    } else {
      window.URL.revokeObjectURL(this.els.image.src);
    }

    this.els.image.src = window.URL.createObjectURL(blob);
    debug('thumbnail set');
  },

  removeThumbnail: function() {
    if (this.els.image) {
      this.els.thumbnail.removeChild(this.els.image);
      window.URL.revokeObjectURL(this.els.image.src);
      this.els.image = null;
    }

    this.set('thumbnail', false);
  },

  /**
   * NOTE: The below functions are a first
   * attempt at replacing the default View
   * `.set()`, `.enable()` and `.disable()` APIs
   * to avoid having to use attributes to style
   * state in our CSS.
   */

  set: function(key, value) {
    if (typeof key !== 'string') { return; }
    if (arguments.length === 1) { value = true; }
    if (!value) { return this.unset(key); }

    var attr = 'data-' + key;
    var oldValue = this.el.getAttribute(attr);
    var oldClass = oldValue && classFrom(key, oldValue);
    var newClass = classFrom(key, value);

    if (oldClass) { this.el.classList.remove(oldClass); }
    if (newClass) { this.el.classList.add(newClass); }

    this.el.setAttribute(attr, value);
    debug('remove: %s, add: %s', oldClass, newClass);
    debug('attr key: %s, value: %s', attr, value);
  },

  get: function(key) {
    var attr = 'data-' + key;
    return this.el.getAttribute(attr);
  },

  unset: function(key) {
    var attr = 'data-' + key;
    var value = this.el.getAttribute(attr);
    this.el.classList.remove(classFrom(key, value));
    this.el.removeAttribute(attr);
  },

  enable: function(key) {
    this.set(key ? key + '-enabled' : 'enabled');
    this.unset(key ? key + '-disabled' : 'disabled');
  },

  disable: function(key) {
    this.set(key ? key + '-disabled' : 'disabled');
    this.unset(key ? key + '-enabled' : 'enabled');
  },

  template: function() {
    /*jshint maxlen:false*/
    return '<div class="controls-left">' +
      '<div class="controls-button controls-thumbnail-button test-thumbnail js-thumbnail rotates" name="thumbnail"></div>' +
      '<div class="controls-button controls-cancel-pick-button test-cancel-pick rotates js-cancel" name="cancel" data-icon="close"></div>' +
    '</div>' +
    '<div class="controls-middle">' +
      '<div class="capture-button test-capture rotates js-capture" name="capture">' +
        '<div class="circle outer-circle"></div>' +
        '<div class="circle inner-circle"></div>' +
        '<div class="center" data-icon="camera"></div>' +
      '</div>' +
    '</div>' +
    '<div class="controls-right">' +
      '<div class="mode-switch test-switch" name="switch">' +
        '<div class="inner js-switch">' +
          '<div class="mode-switch_bg-icon rotates" data-icon="camera"></div>' +
          '<div class="mode-switch_bg-icon rotates" data-icon="video"></div>' +
          '<div class="mode-switch_handle js-switch-handle">' +
            '<div class="mode-switch_current-icon camera rotates js-icon-camera" data-icon="camera"></div>' +
            '<div class="mode-switch_current-icon video rotates js-icon-video" data-icon="video"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
});

/**
 * Examples:
 *
 *   classFrom('recording', true); //=> 'recording'
 *   classFrom('flash', 'on'); //=> 'flash-on'
 *   classFrom('recording', false); //=> ''
 *   classFrom('recording'); //=> 'recording'
 *   classFrom('recording', 'true'); //=> 'recording'
 *   classFrom('recording', 'false'); //=> ''
 *
 * @param  {String} key
 * @param  {*} value
 * @return {String}
 */
function classFrom(key, value) {
  value = detectBooleans(value);
  if (typeof value === 'boolean') {
    return value ? key : '';
  } else if (value) {
    return key + '-' + value ;
  } else {
    return key;
  }
}

function detectBooleans(value) {
  if (typeof value === 'boolean') { return value; }
  else if (value === 'true') { return true; }
  else if (value === 'false') { return false; }
  else { return value; }
}

});

define('controllers/controls',['require','exports','module','debug','views/controls','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:controls');
var ControlsView = require('views/controls');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new ControlsController(app); };
module.exports.ControlsController = ControlsController;

/**
 * Initialize a new `ControlsController`
 *
 * @param {App} app
 */
function ControlsController(app) {
  bindAll(this);
  this.app = app;
  this.activity = app.activity;
  this.createView();
  this.bindEvents();
  debug('initialized');
}

/**
 * Event bindings.
 *
 * @private
 */
ControlsController.prototype.bindEvents = function() {
  this.app.settings.mode.on('change:selected', this.view.setMode);
  this.app.settings.mode.on('change:options', this.configureMode);

  // App
  this.app.on('change:recording', this.onRecordingChange);
  this.app.on('camera:shutter', this.captureHighlightOff);
  this.app.on('newthumbnail', this.onNewThumbnail);
  this.app.once('loaded', this.onceAppLoaded);
  this.app.on('busy', this.onCameraBusy);

  // View
  this.view.on('modechanged', this.onViewModeChanged);
  this.view.on('click:thumbnail', this.app.firer('preview'));
  this.view.on('click:cancel', this.onCancelButtonClick);
  this.view.on('click:capture', this.onCaptureClick);

  // Timer
  this.app.on('timer:started', this.onTimerStarted);
  this.app.on('timer:cleared', this.onTimerStopped);
  this.app.on('timer:ended', this.onTimerStopped);

  // Settings
  this.app.on('settings:opened', this.onSettingsOpened);
  this.app.on('settings:closed', this.onSettingsClosed);

  debug('events bound');
};

/**
 * Create and configure the view.
 *
 * @private
 */
ControlsController.prototype.createView = function() {
  var initialMode = this.app.settings.mode.selected('key');
  var cancellable = !!this.app.activity.pick;

  // Create the view (test hook)
  this.view = this.app.views.controls || new ControlsView();

  // The gallery button should not
  // be shown if an activity is pending
  // or the application is in 'secure mode'.
  this.view.set('cancel', cancellable);
  this.view.setMode(initialMode);

  // Disable view until camera
  // 'ready' enables it.
  this.view.disable();

  // Put it in the DOM
  this.view.appendTo(this.app.el);

  debug('cancelable: %s', cancellable);
  debug('mode: %s', initialMode);
};

/**
 * Disables the switch if there is
 * only one modes available.
 *
 * This is only the case if an activity
 * indicated it only supports one mode,
 * just 'picture' or 'video'.
 *
 * @private
 */
ControlsController.prototype.configureMode = function() {
  var switchable = this.app.settings.mode.get('options').length > 1;
  if (!switchable) { this.view.disable('switch'); }
};

/**
 * Once the app is loaded, we can enable
 * the controls. We also bind a listener
 * that enabled the controls whenever
 * the camera becomes 'ready' from
 * hereon after.
 *
 * @private
 */
ControlsController.prototype.onceAppLoaded = function() {
  this.app.on('ready', this.restore);
  this.view.enable();
};

/**
 * Keep capture button pressed and
 * fire the `capture` event to allow
 * the camera to repond.
 *
 * When the 'camera:shutter' event fires
 * we remove the capture butter pressed
 * state so that it times with the
 * capture sound effect.
 *
 * @private
 */
ControlsController.prototype.onCaptureClick = function() {
  this.captureHighlightOn();
  this.app.emit('capture');
};

/**
 * Set the recording attribute on
 * the view to allow it to style
 * accordingly.
 *
 * @param  {Boolean} recording
 * @private
 */
ControlsController.prototype.onRecordingChange = function(recording) {
  this.view.set('recording', recording);
  if (!recording) { this.onRecordingEnd(); }
};

/**
 * Remove the capture highlight,
 * once recording has finished.
 *
 * @private
 */
ControlsController.prototype.onRecordingEnd = function() {
  this.captureHighlightOff();
};

/**
 * When the thumbnail changes, update it in the view.
 * This method is triggered by the 'newthumbnail' event.
 * That event is emitted by the preview gallery controller when the a new
 * photo or video is added, or when the preview is closed and the first
 * photo or video has changed (because of a file deletion).
 */
ControlsController.prototype.onNewThumbnail = function(thumbnailBlob) {
  if (thumbnailBlob) {
    this.view.setThumbnail(thumbnailBlob);
  } else {
    this.view.removeThumbnail();
  }
};

/**
 * Forces the capture button to
 * look pressed while the timer is
 * counting down and hides controls.
 *
 * @private
 */
ControlsController.prototype.onTimerStarted = function() {
  this.captureHighlightOn();
  this.view.set('timer', 'active');
};

/**
 * Forces the capture button to
 * look unpressed when the timer
 * stops and shows controls.
 *
 * @private
 */
ControlsController.prototype.onTimerStopped = function() {
  this.captureHighlightOff();
  this.view.set('timer', 'inactive');
};

/**
 * Make controls invisible to the screen reader since they are behind settings
 * overlay.
 *
 * @private
 */
ControlsController.prototype.onSettingsOpened = function() {
  this.view.setScreenReaderVisible(false);
};

/**
 * Make controls visible to the screen reader again when settings are closed.
 *
 * @private
 */
ControlsController.prototype.onSettingsClosed = function() {
  this.view.setScreenReaderVisible(true);
};

ControlsController.prototype.onCameraBusy = function() {
  this.view.disable();
};

/**
 * Restores the capture button to its
 * unpressed state and re-enables buttons.
 *
 * @private
 */
ControlsController.prototype.restore = function() {
  debug('restore');
  this.captureHighlightOff();
  this.view.enable();
};

/**
 * Make the capture button
 * appear pressed.
 *
 * @private
 */
ControlsController.prototype.captureHighlightOn = function() {
  this.view.set('capture-active');
};

/**
 * Remove the pressed apperance
 * from the capture button.
 *
 * @private
 */
ControlsController.prototype.captureHighlightOff = function() {
  this.view.unset('capture-active');
};

/**
 * Switch to the next capture mode:
 * 'picture' or 'video', when the
 * mode is changed via the view.
 *
 * Them mode can be changed by either
 * tapping or swiping the mode switch.
 *
 * @private
 */
ControlsController.prototype.onViewModeChanged = function() {
  debug('view mode changed');
  this.app.settings.mode.next();
};

ControlsController.prototype.onCancelButtonClick = function() {
  this.app.emit('activitycanceled');
};

/**
 * Open the gallery app when the
 * gallery button is pressed.
 *
 * @private
 */
ControlsController.prototype.onGalleryButtonClick = function(event) {
  event.stopPropagation();
  var MozActivity = window.MozActivity;

  // Can't launch the gallery if the lockscreen is locked.
  // The button shouldn't even be visible in this case, but
  // let's be really sure here.
  if (this.app.inSecureMode) { return; }

  // Launch the gallery with an activity
  this.mozActivity = new MozActivity({
    name: 'browse',
    data: { type: 'photos' }
  });

  // Wait 2000ms before re-enabling the
  // Gallery to be launched (Bug 957709)
  this.view.disable();
  setTimeout(this.view.enable, 2000);
};

});

/*

This module contains functions to deal with android camera coordinates.

Example use cases:

1. In the camera application we want to convert to screen coordinates
the top left corner of the faces detected by the camera so we can position a
DOM element to highlight the corresponding area.

2. We have to transform screen to android camera coordinates when
the user touches the screen to focus on a specific area.

In both cases we have to take into account the possible mismatch between the
screen pixels order and the order of the pixels sent by the driver.

ANDROID CAMERA COORDINATES

This documentation contain how android coordinates work and how the screen,
sensor and scene coordinates relate to one another.

The following is *always* true: the active rectangles of
the phone/screen and the sensor always -physically- line up.
It  has to be thus, otherwise it would be impossible to
fill a portrait  viewfinder with a portrait view, or a
landscape viewfinder with a  landscape view.

Visually, this looks like:

phone/screen
+------+
|      |
|      |
|      |
|      |
|      |
|      |
|      |
|      |
+------+

sensor
+----+
|    |
|    |
|    |
|    |
+----+

detected face reported by the camera driver
-------------------------------------------

        top
      +-----+
      |     |
 left |     | right
      |     |
      +-----+
       bottom

The driver also reports width and height

If sensor orientation is 0, the sensor and the screen are scanned like this:

phone/screen
+------+
|aabbcc|
|aabbcc|
|ddeeff|
|ddeeff|
|gghhii|
|gghhii|
|jjkkll|
|jjkkll|
+------+

sensor
O---+    O = Origin of sensor coordinates (-1000, -1000)
|abc|    X = (1000, 1000)
|def|    sensor-to-screen conversion => none (x = x, y = y)
|ghi|    face coordinate to convert => top, left
|jkl|
+---X

If there is an arrow pointing right:
o-->
...the sensor sees this arrow as such:

+----+
|    |
|o-->|
|    |
|    |
+----+

...and if the sensor orientation is 0, the
arrow appears on the screen (magnified) like this:

+--------+
|        |
|        |
|        |
|()====>>|
|        |
|        |
|        |
|        |
+--------+

If the sensor orientation is, e.g., 90-degrees--that is,
the "top" of the sensor corresponds to the "right" of the
screen--then without applying any rotation to the UI,
the arrow appears on the screen like this:

+--------+
|        |
|        |
|   ^    |
|   |    |
|   O    |
|        |
|        |
|        |
+--------+

The arrow is smaller, because the frames need to be
shrunk so that the entire height of the sensor image
fits into the width of the screen.
In this case, rotating the UI by 90-degrees clockwise,
and stretching it to fill the screen, gives:

+--------+
|        |
|        |
|        |
|()====>>|
|        |
|        |
|        |
|        |
+--------+

This is because, in the 90-degree sensor
orientation case, the scanning is like this:

sensor
+---O    O = Origin of sensor coordinates (-1000, -1000)
|iea|    X = (1000, 1000)
|jfb|    sensor-to-screen conversion => x = -y, y = x
|kgc|    face coordinate to convert => bottom, left
|lhd|
X---+

And without compensating for this rotation,
the image on the screen would appear like this:
+------+
|      |
|      |
| abcd |
| efgh |
| ijkl |
|      |
|      |
|      |
+------+

Thus sensor orientation has nothing to do with the physical
orientation of the sensor. Rather, it has to do with which
scan-line in the sensor is considered the "top".
Given all this, the coordinates of the "top-left" of
the sensor view, (-1000, -1000), are the coordinates of the
first pixel of the first scan-line. Similarly, the "bottom-right"
of the sensor is the last pixel of the last scan-line,
and has coordinates (1000, 1000).

----- 8< -----
As requested, the 180-degree case is:

phone/screen
+------+
|aabbcc|
|aabbcc|
|ddeeff|
|ddeeff|
|gghhii|
|gghhii|
|jjkkll|
|jjkkll|
+------+

sensor
X---+    O = Origin of sensor coordinates (-1000, -1000)
|jkl|    X = (1000, 1000)
|ihg|    sensor-to-screen conversion => x = -x, y = -y
|fed|    face coordinate to convert => bottom, right
|cba|
+---O

And the 270-degree case is:

phone/screen
+------+
|      |
|      |
| abcd |
| efgh |
| ijkl |
|      |
|      |
|      |
+------+

sensor
+---X    O = Origin of sensor coordinates (-1000, -1000)
|dhl|    X = (1000, 1000)
|cgk|    sensor-to-screen conversion => x = y, y = -x
|bfj|    face coordinate to convert => bottom, right
|aei|
O---+

*/
define('lib/camera-coordinates',['require','exports','module'],function(require, exports, module) {
/*jshint maxlen:false*/


/**
 * It transforms camera coordinates to pixels
 *
 *  @private
 */
function toPixels(x, y, viewportWidth, viewportHeight) {
  // In camera coordinate system, (-1000, -1000) represents the
  // top-left of the camera field of view, and (1000, 1000) represents
  // the bottom-right.
  // For convenience we assume that coordinates go from 0-2000
  var cameraCoordinatesRange = 2000;

  // How many pixels per camera unit?
  var pixelsPerCameraUnitWidth = viewportWidth / cameraCoordinatesRange;
  var pixelsPerCameraUnitHeight = viewportHeight / cameraCoordinatesRange;
  // It makes the faces coordinates to go from 0-2000 for convenience
  var xCameraCoordinates = x + 1000;
  var yCameraCoordinates = y + 1000;
  var xPixelCoordinates = xCameraCoordinates * pixelsPerCameraUnitWidth;
  var yPixelCoordinates = yCameraCoordinates * pixelsPerCameraUnitHeight;
  return {
    x: Math.round(xPixelCoordinates),
    y: Math.round(yPixelCoordinates)
  };
}

/**
 *  It transforms pixels to camera coordinates
 *
 *  @private
 */
function toCamera(x, y, viewportWidth, viewportHeight) {
  // In camera coordinate system, (-1000, -1000) represents the
  // top-left of the camera field of view, and (1000, 1000) represents
  // the bottom-right.
  var cameraCoordinatesRange = 2000;
  // How many camera units per pixel?
  var cameraUnitsPerPixelWidth = cameraCoordinatesRange / viewportWidth;
  var cameraUnitsPerPixelHeight = cameraCoordinatesRange / viewportHeight;
  return {
    x: Math.round(x * cameraUnitsPerPixelWidth) - 1000,
    y: Math.round(y * cameraUnitsPerPixelHeight) - 1000
  };
}

/**
 *  It rotates camera coordinates given an angle 0, 90, 180, 270
 *
 *  @private
*/
function rotatePoint(x, y, angle) {
  // It clamps the angle to +/- 0-270
  angle = (Math.round((angle % 360) / 90) % 4) * 90;
  switch (angle) {
    case 0:
      return {
        x: x,
        y: y
      };
    case 90:
    case -270:
      return {
        x: -y,
        y: x
      };
    case 180:
    case -180:
     return {
        x: -x,
        y: -y
      };
    case 270:
    case -90:
      return {
        x: y,
        y: -x
      };
    default:
      console.error('wrong angle value');
  }
}

 /**
  *  The sensor orientation is the orientation of the camera output
  *  (the order of the pixels sent from the sensor to the preview stream) with
  *  respect to the device screen in portrait orientation.
  *  This function matches the orientation of the sensor and screen coordinates
  *  We're interested on the top left and bottom-rignt corners of the
  *  area as observed through the lenses (scene coordinates).
  *  We take into account the orientation of the sensor to pick the correct
  *  corner that corresponds to the top most, left most, right most and
  *  bottom most coordinates in the physical/scene space as observed through the camera preview.
  *
  *  @private
  */
function rotateArea(area, sensorOrientation) {
  var topLeft = rotatePoint(area.left, area.top, sensorOrientation);
  var bottomRight = rotatePoint(area.right, area.bottom, sensorOrientation);
  // It picks the top left and bottom right corners on the scene / physical space
  return {
      top: Math.min(topLeft.y, bottomRight.y),
      left: Math.min(topLeft.x, bottomRight.x),
      bottom: Math.max(topLeft.y, bottomRight.y),
      right: Math.max(topLeft.x, bottomRight.x),
      width: Math.abs(topLeft.x - bottomRight.x),
      height: Math.abs(topLeft.y - bottomRight.y)
  };
}

/**
 *  It mirrors a given area in camera coordinates
 *  Use case: Display detected faces by the front camera.
 *
 *  @private
 */
function mirrorAreaCamera(area) {
  return {
    top: area.top,
    left: -area.right,
    bottom: area.bottom,
    right: -area.left,
    width: area.width,
    height: area.height
  };
}

/**
 *  It mirrors a given area in camera coordinates
 *  Use case: Display detected faces by the front camera.
 *
 *  @private
 */
function mirrorAreaPixels(area, viewportWidth) {
  return {
    top: area.top,
    left: viewportWidth - area.right,
    bottom: area.bottom,
    right: viewportWidth - area.left,
    width: area.width,
    height: area.height
  };
}


/**
 *  Given a distance in pixels and a screen size it returns
 *  the distance in camera units.
 *
 *  @private
 */
function sizeToCamera(width, height, viewportWidth, viewportHeight) {
  // In camera coordinate system, (-1000, -1000) represents the
  // top-left of the camera field of view, and (1000, 1000) represents
  // the bottom-right of the field of view.
  // There are 2000 units in each axis of the camera coordinates
  var cameraCoordinatesRange = 2000;
  // How many camera units per pixel?
  var cameraUnitsPerPixelWidth = cameraCoordinatesRange/ viewportWidth;
  var cameraUnitsPerPixelHeight = cameraCoordinatesRange / viewportHeight;
  return {
    width: Math.round(width * cameraUnitsPerPixelWidth),
    height: Math.round(height * cameraUnitsPerPixelHeight)
  };
}

/**
 *  Given a distance in camera units and a screen size it returns
 *  the distance in pixels.
 *
 *  @private
 */
function sizeToPixels(width, height, viewportWidth, viewportHeight) {
  // In camera coordinate system, (-1000, -1000) represents the
  // top-left of the camera field of view, and (1000, 1000) represents
  // the bottom-right of the field of view.
  // There are 2000 units in each axis of the camera coordinates
  var cameraCoordinatesRange = 2000;
  // How many pixels per camera coordinates unit?
  var pixelsPerCameraUnitWidth = viewportWidth / cameraCoordinatesRange;
  var pixelsPerCameraUnitHeight = viewportHeight / cameraCoordinatesRange;
  return {
    width: Math.round(width * pixelsPerCameraUnitWidth),
    height: Math.round(height * pixelsPerCameraUnitHeight)
  };
}

/**
 *  Given an area in screen camera units (-1000, 1000)
 *  and viewport dimensions it returns the same area
 *  in pixels
 *
 *  @private
 */
function areaToPixels(area, viewportWidth, viewportHeight) {
  // It converts the face from Android camera coordinates to pixels
  var areaPixels = toPixels(
    area.left, area.top, viewportWidth, viewportHeight);
  // It converts the face size from Android camera units to pixels
  var areaPixelSize = sizeToPixels(
    area.width, area.height,
    viewportWidth, viewportHeight);
  var width = areaPixelSize.width;
  var height = areaPixelSize.height;
  return {
    top: areaPixels.y,
    left: areaPixels.x,
    bottom: areaPixels.y + height,
    right: areaPixels.x + width,
    width: width,
    height: height
  };
}

/**
 *  Given an area in screen pixel coordinates
 *  and viewport dimensions it returns the same area
 *  in android camera coordinates (-1000, 1000)
 *
 *  @public
 */
function areaToCamera(area, viewportWidth, viewportHeight) {
  var topLeft = toCamera(
    area.left, area.top, viewportWidth, viewportHeight);
  // It converts the size from pixels to camera units
  var areaCameraUnits = sizeToCamera(
    area.width, area.height,
    viewportWidth, viewportHeight);
  var width = areaCameraUnits.width;
  var height = areaCameraUnits.height;
  var areaCamera = {
    top: topLeft.y,
    left: topLeft.x,
    bottom: topLeft.y + height,
    right: topLeft.x + width,
    height: height,
    width: width
  };
  return areaCamera;
}

/**
 *  Given face coordinates in pixels
 *  a viewport width and height it returns the face coordinates
 *  and area in camera units
 *
 *  @public
 */
function faceToCamera(face, viewportWidth, viewportHeight, sensorOrientation, mirrored) {
  if (mirrored) {
    face = mirrorAreaPixels(face, viewportWidth);
  }
  face = areaToCamera(face, viewportWidth, viewportHeight);
  // The orientation of the screen and the sensor might not match.
  // We rotate the face so it matches screen coordinates orientation
  if (sensorOrientation) {
    face = rotateArea(face, -sensorOrientation);
  }
  return face;
}

/**
 *  Given face coordinates as provided by camera controller and
 *  a viewport width and height it returns the face coordinates, diameter
 *  and area in pixel units
 *
 *  @public
 */
function faceToPixels(face, viewportWidth, viewportHeight, sensorOrientation, mirrored) {
  // The orientation of the screen and the sensor might not match.
  // We rotate the face so it matches screen coordinates orientation
  if (sensorOrientation) {
    face = rotateArea(face, sensorOrientation);
  }
  if (mirrored) {
    face = mirrorAreaCamera(face);
  }
  return areaToPixels(face, viewportWidth, viewportHeight);
}

return {
  // Face transformations
  faceToCamera: faceToCamera,
  faceToPixels: faceToPixels,
  // Area transformations
  private: {
    // Area transformations
    areaToCamera: areaToCamera,
    areaToPixels: areaToPixels,
    mirrorAreaCamera: mirrorAreaCamera,
    mirrorAreaPixels: mirrorAreaPixels,
    rotateArea: rotateArea,
    // Size transformations
    sizeToCamera: sizeToCamera,
    sizeToPixels: sizeToPixels,
    // Point transformations
    toCamera: toCamera,
    toPixels: toPixels,
    rotatePoint: rotatePoint
  }
};

});
define('views/viewfinder',['require','exports','module','debug','lib/bind','lib/camera-utils','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:viewfinder');
var bind = require('lib/bind');
var CameraUtils = require('lib/camera-utils');
var View = require('view');

/**
 * Locals
 */

var isZoomEnabled = false;
var scaleSizeTo = {
  fill: CameraUtils.scaleSizeToFillViewport,
  fit: CameraUtils.scaleSizeToFitViewport
};

var clamp = function(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
};

module.exports = View.extend({
  name: 'viewfinder',
  className: 'js-viewfinder',
  fadeTime: 360,

  initialize: function() {
    this.render();
    this.getSize();
  },

  render: function() {
    this.el.innerHTML = this.template();
    this.els.frame = this.find('.js-frame');
    this.els.video = this.find('.js-video');
    this.els.videoContainer = this.find('.js-video-container');

    // Clean up
    delete this.template;

    debug('rendered');
    return this.bindEvents();
  },

  bindEvents: function() {
    bind(this.el, 'click', this.onClick);
    bind(this.el, 'animationend', this.onShutterEnd);
    return this;
  },

  /**
   * Stores the container size.
   *
   * We're using window dimensions
   * here to avoid causing costly
   * reflows.
   *
   * @public
   */
  getSize: function() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    return {
      width: this.width,
      height: this.height
    };
  },

  onClick: function(e) {
    this.emit('click', e);
  },

  enableZoom: function(minimumZoom, maximumZoom) {
    if (minimumZoom) {
      this._minimumZoom = minimumZoom;
    }

    if (maximumZoom) {
      this._maximumZoom = maximumZoom;
    }

    isZoomEnabled = true;
  },

  disableZoom: function() {
    this._minimumZoom = 1.0;
    this._maximumZoom = 1.0;

    this.setZoom(1.0);

    isZoomEnabled = false;
  },

  _minimumZoom: 1.0,

  setMinimumZoom: function(minimumZoom) {
    this._minimumZoom = minimumZoom;
  },

  _maximumZoom: 1.0,

  setMaximumZoom: function(maximumZoom) {
    this._maximumZoom = maximumZoom;
  },

  _zoom: 1.0,

  /**
   * Update the internal state of the view so that any future
   * pinch-to-zoom gestures can correctly adjust the current zoom
   * level in the event that the zoom level is changed outside of
   * the pinch-to-zoom gesture (e.g.: ZoomBar). This gets called
   * when the `Camera` emits a `zoomchanged` event.
   */
  setZoom: function(zoom) {
    if (!isZoomEnabled) {
      return;
    }

    this._zoom = clamp(zoom, this._minimumZoom, this._maximumZoom);
  },

  _useZoomPreviewAdjustment: false,

  enableZoomPreviewAdjustment: function() {
    this._useZoomPreviewAdjustment = true;
  },

  disableZoomPreviewAdjustment: function() {
    this._useZoomPreviewAdjustment = false;
  },

  /**
   * Adjust the scale of the <video/> tag to compensate for the inability
   * of the Camera API to zoom the preview stream beyond a certain point.
   * This gets called when the `Camera` emits a `zoomchanged` event and is
   * calculated by `Camera.prototype.getZoomPreviewAdjustment()`.
   */
  setZoomPreviewAdjustment: function(zoomPreviewAdjustment) {
    if (this._useZoomPreviewAdjustment) {
      this.els.video.style.transform = 'scale(' + zoomPreviewAdjustment + ')';
    }
  },

  stopStream: function() {
    this.els.video.mozSrcObject = null;
  },

  fadeOut: function(done) {
    debug('fade-out');
    var self = this;
    this.hide();
    document.body.classList.remove('no-background');
    clearTimeout(this.fadeTimeout);
    this.fadeTimeout = setTimeout(function() {
      self.emit('fadedout');
      if (done) { done(); }
    }, this.fadeTime);
  },

  fadeIn: function(ms, done) {
    debug('fade-in');
    var self = this;
    if (typeof ms === 'function') { done = ms, ms = null; }
    ms = ms || this.fadeTime;
    this.el.style.transitionDuration = ms + 'ms';
    this.show();
    clearTimeout(this.fadeTimeout);
    this.fadeTimeout = setTimeout(function() {
      document.body.classList.add('no-background');
      self.el.style.transitionDuration = '';
      self.emit('fadedin');
      if (done) { done(); }
    }, ms);
  },

  /**
   * Triggers a quick shutter style animation.
   *
   * @private
   */
  shutter: function() {
    this.el.classList.add('shutter');
  },

  /**
   * Force a reflow before removing
   * the shutter class so that it
   * doesn't impact the animation.
   *
   * @private
   */
  onShutterEnd: function() {
    this.reflow = this.el.offsetTop;
    this.el.classList.remove('shutter');
  },

  /**
   * Sizes and positions the preview stream.
   *
   * @param  {Object} preview
   * @param  {Number} sensorAngle
   * @param  {Boolean} mirrored
   */
  updatePreview: function(preview, sensorAngle, mirrored) {
    if (!preview) { return; }
    var aspect;

    // Invert dimensions if the camera's `sensorAngle` is
    // 0 or 180 degrees.
    if (sensorAngle % 180 === 0) {
      this.container = {
        width: this.width,
        height: this.height,
        aspect: this.width / this.height
      };

      aspect = preview.height / preview.width;
    } else {
      this.container = {
        width: this.height,
        height: this.width,
        aspect: this.height / this.width
      };

      aspect = preview.width / preview.height;
    }

    var shouldFill = aspect > this.container.aspect;
    var scaleType = this.scaleType || (shouldFill ? 'fill' : 'fit');

    this.updatePreviewMetrics(preview, sensorAngle, mirrored, scaleType);
  },

  /**
   * Calculates the correct sizing
   * depending on the chosen 'scaleType'.
   *
   * 'scale-type' attribute set as a styling hook.
   *
   * @param  {Object} preview
   * @param  {Number} sensorAngle
   * @param  {Boolean} mirrored
   * @param  {String} scaleType 'fill'|'fit'
   */
  updatePreviewMetrics: function(preview, sensorAngle, mirrored, scaleType) {
    debug('update preview scaleType: %s', scaleType, preview);

    // Calculate the correct scale to apply to the
    // preview to either 'fill' or 'fit' the viewfinder
    // container (always preserving the aspect ratio).
    var landscape = scaleSizeTo[scaleType](this.container, preview);
    var portrait = { width: landscape.height, height: landscape.width };

    // Set the size of the frame to match 'portrait' dimensions
    this.els.frame.style.width = portrait.width + 'px';
    this.els.frame.style.height = portrait.height + 'px';

    var transform = '';
    if (mirrored) {
      transform += 'scale(-1, 1) ';
    }

    transform += 'rotate(' + sensorAngle + 'deg)';

    // Set the size of the video container to match the
    // 'landscape' dimensions (CSS is used to rotate
    // the 'landscape' video stream to 'portrait')
    this.els.videoContainer.style.width = landscape.width + 'px';
    this.els.videoContainer.style.height = landscape.height + 'px';
    this.els.videoContainer.style.transform = transform;

    // CSS aligns the contents slightly
    // differently depending on the scaleType
    this.set('scaleType', scaleType);

    debug('updated preview size/position', landscape);
  },

  template: function() {
    return '<div class="viewfinder-frame js-frame">' +
        '<div class="viewfinder-video-container js-video-container" ' +
        'aria-hidden="true">' +
          '<video class="viewfinder-video js-video"></video>' +
        '</div>' +
        '<div class="viewfinder-grid">' +
          '<div class="row"></div>' +
          '<div class="row middle"></div>' +
          '<div class="row"></div>' +
          '<div class="column left">' +
            '<div class="cell top"></div>' +
            '<div class="cell middle"></div>' +
            '<div class="cell bottom"></div>' +
          '</div>' +
          '<div class="column middle">' +
            '<div class="cell top"></div>' +
            '<div class="cell middle"></div>' +
            '<div class="cell bottom"></div>' +
          '</div>' +
          '<div class="column right">' +
           '<div class="cell top"></div>' +
           '<div class="cell middle"></div>' +
           '<div class="cell bottom"></div>' +
          '</div>' +
          '</div>' +
        '</div>' +
    '</div>';
  }
});

});

define('views/focus',['require','exports','module','debug','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:focus');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'focus',
  fadeTime: 500,

  initialize: function() {
    this.render();
    this.setFocusState('none');
  },

  render: function() {
    this.el.innerHTML = this.template();
    delete this.template; // Clean up
    debug('rendered');
    return this;
  },

  setFocusState: function(state) {
    this.set('state', state);
    if (state !== 'focusing') {
      this.fadeOut();
    }
  },

  setFocusMode: function(mode) {
    this.reset();
    this.set('mode', mode);
  },

  setPosition: function(x, y) {
    if (this.fadeOutTimer) {
      clearTimeout(this.fadeOutTimer);
    }
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  },

  reset: function() {
    this.el.style.left = '50%';
    this.el.style.top = '50%';
    this.set('state', 'none');
  },

  fadeOut: function() {
    var self = this;
    this.fadeOutTimer = setTimeout(hide, this.fadeTime);
    function hide() {
      self.reset();
    }
  },

  template: function() {
    return '<div class="focus_locking" data-icon="focus-locking"></div>' +
      '<div class="focus_locked" data-icon="focus-locked"></div>';
  }

});

});

define('views/face',['require','exports','module','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'face',

  initialize: function() {
    this.render();
  },

  render: function() {
    this.el.innerHTML = this.template();
    this.el.classList.add('js-face');
  },

  setPosition: function(x, y) {
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  },

  setDiameter: function(diameter) {
    this.el.style.width = diameter + 'px';
    this.el.style.height = diameter + 'px';
  }

});

});

define('views/faces',['require','exports','module','views/face','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var FaceView = require('views/face');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'faces',
  faces: [],

  initialize: function(options) {
    options = options || {};
    this.el.innerHTML = this.template();
    this.FaceView = options.FaceView || FaceView;
  },

  // It creates the DOM elements that will display circles
  // around the detected faces.
  configure: function(maxNumberFaces) {
    var faceView;
    var i;
    for(i = 0; i < maxNumberFaces; ++i) {
      faceView = new this.FaceView();
      faceView.hide();
      this.faces.push(faceView);
      faceView.appendTo(this.el);
    }
  },

  render: function(faces) {
    var self = this;
    this.hideFaces();
    faces.forEach(function(face, index) {
      var faceView = self.faces[index];
      self.renderFace(face, faceView);
    });
  },

  renderFace: function(face, faceView) {
    // Maximum diameter is 300px as in the visual spec
    var diameter = Math.min(300, face.diameter);
    faceView.setPosition(face.x, face.y);
    faceView.setDiameter(diameter);
    faceView.show();
  },

  hideFaces: function() {
    this.faces.forEach(function(faceView) {
      faceView.hide();
    });
  },

  clear: function() {
    var self = this;
    this.faces.forEach(function(faceView) {
      self.el.removeChild(faceView.el);
    });
    this.faces = [];
  }

});

});

define('controllers/viewfinder',['require','exports','module','lib/camera-coordinates','debug','views/viewfinder','views/focus','views/faces','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var cameraCoordinates = require('lib/camera-coordinates');
var debug = require('debug')('controller:viewfinder');
var ViewfinderView = require('views/viewfinder');
var FocusView = require('views/focus');
var FacesView = require('views/faces');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new ViewfinderController(app); };
module.exports.ViewfinderController = ViewfinderController;

/**
 * Initialize a new `ViewfinderController`
 *
 * @param {App} app
 */
function ViewfinderController(app) {
  bindAll(this);
  this.app = app;
  this.camera = app.camera;
  this.activity = app.activity;
  this.settings = app.settings;
  this.createViews();
  this.bindEvents();
  this.configure();
  debug('initialized');
}

/**
 * Create and inject the views.
 *
 * @private
 */
ViewfinderController.prototype.createViews = function() {
  this.views = {};
  this.views.viewfinder = this.app.views.viewfinder || new ViewfinderView();
  this.views.focus = this.app.views.focus || new FocusView();
  this.views.faces = this.app.views.faces || new FacesView();
  this.views.focus.appendTo(this.views.viewfinder.el);
  this.views.faces.appendTo(this.views.viewfinder.el);
  this.views.viewfinder.appendTo(this.app.el);
};

/**
 * Initial configuration.
 *
 * @private
 */
ViewfinderController.prototype.configure = function() {
  var settings = this.app.settings;
  var zoomSensitivity = settings.viewfinder.get('zoomGestureSensitivity');
  this.sensitivity = zoomSensitivity * window.innerWidth;
  this.configureScaleType();
  this.configureGrid();
};

/**
 * Configure the viewfinder scale type,
 * aspect fill/fit, depending on setting.
 *
 * @private
 */
ViewfinderController.prototype.configureScaleType = function() {
  var scaleType = this.app.settings.viewfinder.get('scaleType');
  this.views.viewfinder.scaleType = scaleType;
  debug('set scale type: %s', scaleType);
};

/**
 * Show/hide grid depending on currently
 * selected option.
 *
 * @private
 */
ViewfinderController.prototype.configureGrid = function() {
  var grid = this.app.settings.grid.selected('key');
  this.views.viewfinder.set('grid', grid);
};

/**
 * Hides the viewfinder frame-grid.
 *
 * @private
 */
ViewfinderController.prototype.hideGrid = function() {
  this.views.viewfinder.set('grid', 'off');
};

/**
 * Bind to relavant events.
 *
 * @private
 */
ViewfinderController.prototype.bindEvents = function() {

  // View
  this.views.viewfinder.on('fadedin', this.app.firer('viewfinder:visible'));
  this.views.viewfinder.on('fadedout', this.app.firer('viewfinder:hidden'));
  this.views.viewfinder.on('click', this.app.firer('viewfinder:click'));
  this.views.viewfinder.on('click', this.onViewfinderClicked);

  // Tut tut, we shouldn't have direct coupling here.
  // TODO: Camera events should be relayed through the app.
  this.camera.on('zoomconfigured', this.onZoomConfigured);
  this.camera.on('zoomchanged', this.onZoomChanged);
  this.camera.on('preview:started', this.show);

  // Camera
  this.app.on('camera:autofocuschanged', this.views.focus.showAutoFocusRing);
  this.app.on('camera:focusstatechanged', this.views.focus.setFocusState);
  this.app.on('camera:focusconfigured', this.onFocusConfigured);
  this.app.on('camera:shutter', this.views.viewfinder.shutter);
  this.app.on('camera:facesdetected', this.onFacesDetected);
  this.app.on('camera:configured', this.onCameraConfigured);
  this.app.on('camera:previewactive', this.onPreviewActive);
  this.app.on('busy', this.views.viewfinder.disable);
  this.app.on('ready', this.views.viewfinder.enable);
  this.app.on('camera:willchange', this.hide);

  // Preview Gallery
  this.app.on('previewgallery:opened', this.onGalleryOpened);
  this.app.on('previewgallery:closed', this.onGalleryClosed);

  // Settings
  this.app.on('settings:closed', this.onSettingsClosed);
  this.app.on('settings:opened', this.onSettingsOpened);
  this.app.settings.grid.on('change:selected',
    this.views.viewfinder.setter('grid'));

  // App
  this.app.on('pinch:changed', this.onPinchChanged);
  this.app.on('hidden', this.stopStream);
};

/**
 * Perform required viewfinder configuration
 * once the camera has configured.
 *
 * @private
 */
ViewfinderController.prototype.onCameraConfigured = function() {
  debug('configuring');
  this.loadStream();
  this.configurePreview();
};

/**
 * Show the viewfinder.
 *
 * If the critical-path is not done we
 * fade the viewfinder in straight away
 * to make sure we have the quickest
 * startup possible.
 *
 * We have to use a timeout for all other
 * viewfinder showing actions conceal a Gecko
 * rendering bug whereby the video element has
 * not yet 'visually' switched to the new stream
 * when we get the preview 'started' event from
 * the camera. This means the user sees a flicker
 * if we don't give it some time to adjust.
 *
 * We clear these timeouts to avoid multiple pending
 * timeouts, which could cause pain.
 *
 * https://bugzilla.mozilla.org/show_bug.cgi?id=982230
 *
 * @private
 */
ViewfinderController.prototype.show = function() {
  debug('show');
  if (!this.app.criticalPathDone) {
    this.views.viewfinder.fadeIn(1);
    return;
  }

  clearTimeout(this.showTimeout);
  this.showTimeout = setTimeout(this.views.viewfinder.fadeIn, 280);
  debug('schedule delayed fade-in');
};

/**
 * Fades the viewfinder in.
 *
 * We clear any pending timeouts here
 * to prevent unusual behaviour ensuing.
 *
 * @private
 */
ViewfinderController.prototype.hide = function() {
  debug('hide');
  clearTimeout(this.showTimeout);
  this.views.viewfinder.fadeOut();
};

/**
 *  Sets appropiate flags when the camera focus is configured
 */
ViewfinderController.prototype.onFocusConfigured = function(config) {
  this.views.focus.setFocusMode(config.mode);
  this.touchFocusEnabled = config.touchFocus;
  this.views.faces.clear();
  if (config.maxDetectedFaces > 0) {
    this.views.faces.configure(config.maxDetectedFaces);
  }
};

ViewfinderController.prototype.onFacesDetected = function(faces) {
  var self = this;
  var faceCircles = [];
  var viewfinderSize =  this.views.viewfinder.getSize();
  var viewportHeight = viewfinderSize.height;
  var viewportWidth = viewfinderSize.width;
  var sensorAngle = this.camera.getSensorAngle();
  var camera = this.app.settings.cameras.selected('key');
  var isFrontCamera = camera === 'front';

  faces.forEach(function(face, index) {
    // Face comes in camera coordinates from gecko
    var faceInPixels = cameraCoordinates.faceToPixels(
      face.bounds, viewportWidth, viewportHeight, sensorAngle, isFrontCamera);
    var faceCircle = self.calculateFaceCircle(faceInPixels);
    faceCircles.push(faceCircle);
  });
  this.views.faces.show();
  this.views.faces.render(faceCircles);
};

ViewfinderController.prototype.calculateFaceCircle = function(face) {
  return {
    x: face.left,
    y: face.top,
    diameter: Math.max(face.width, face.height)
  };
};

/**
 * Start the viewfinder stream flowing
 * with the current camera configuration.
 *
 * This indirectly enforces a screen wakelock,
 * meaning the device is unable to go to sleep.
 *
 * We don't want the stream to start flowing if
 * the preview-gallery is open, as this prevents
 * the device falling asleep.
 *
 * @private
 */
ViewfinderController.prototype.loadStream = function() {
  this.camera.loadStreamInto(this.views.viewfinder.els.video);
  debug('stream started');
};

/**
 * Stop the preview stream flowing.
 *
 * This indirectly removes the wakelock
 * that is magically enforced by the
 * flowing camera stream. Meaning the
 * device is able to go to sleep.
 *
 * @private
 */
ViewfinderController.prototype.stopStream = function() {
  this.views.viewfinder.stopStream();
  debug('stream stopped');
};

/**
 * Configure the size and postion
 * of the preview video stream.
 *
 * @private
 */
ViewfinderController.prototype.configurePreview = function() {
  var camera = this.app.settings.cameras.selected('key');
  var isFrontCamera = camera === 'front';
  var sensorAngle = this.camera.getSensorAngle();
  var previewSize = this.camera.previewSize();

  this.views.viewfinder.updatePreview(previewSize, sensorAngle, isFrontCamera);
};

/**
 * Configures the viewfinder
 * to the current camera.
 *
 * @private
 */
ViewfinderController.prototype.onZoomConfigured = function() {
  var zoomSupported = this.camera.isZoomSupported();
  var zoomEnabled = this.app.settings.zoom.enabled();
  var enableZoom = zoomSupported && zoomEnabled;

  if (!enableZoom) {
    this.views.viewfinder.disableZoom();
    return;
  }

  if (this.app.settings.zoom.get('useZoomPreviewAdjustment')) {
    this.views.viewfinder.enableZoomPreviewAdjustment();
  } else {
    this.views.viewfinder.disableZoomPreviewAdjustment();
  }

  var minimumZoom = this.camera.getMinimumZoom();
  var maximumZoom = this.camera.getMaximumZoom();

  this.views.viewfinder.enableZoom(minimumZoom, maximumZoom);
};

/**
 * Updates the zoom level on the camera
 * when the pinch changes.
 *
 * @private
 */
ViewfinderController.prototype.onPinchChanged = function(deltaPinch) {
  var zoom = this.views.viewfinder._zoom *
    (1 + (deltaPinch / this.sensitivity));
  this.views.viewfinder.setZoom(zoom);
  this.camera.setZoom(zoom);
};

/**
 * Responds to changes of the `zoom` value on the Camera to update the
 * view's internal state so that the pinch-to-zoom gesture can resume
 * zooming from the updated value. Also, updates the CSS scale transform
 * on the <video/> tag to compensate for zooming beyond the
 * `maxHardwareZoom` value.
 *
 * @param {Number} zoom
 */
ViewfinderController.prototype.onZoomChanged = function(zoom) {
  var zoomPreviewAdjustment = this.camera.getZoomPreviewAdjustment();
  this.views.viewfinder.setZoomPreviewAdjustment(zoomPreviewAdjustment);
  this.views.viewfinder.setZoom(zoom);
};

ViewfinderController.prototype.onViewfinderClicked = function(e) {
  if (!this.touchFocusEnabled || this.app.get('timerActive')) {
    return;
  }
  this.views.faces.hide();
  this.changeFocusPoint(e.pageX, e.pageY);
};

ViewfinderController.prototype.changeFocusPoint = function(x, y) {
  var viewfinderSize =  this.views.viewfinder.getSize();
  var viewportHeight = viewfinderSize.height;
  var viewportWidth = viewfinderSize.width;
  var sensorAngle = this.camera.getSensorAngle();
  var focusAreaSize = 10;
  var focusAreaHalfSide = Math.round(focusAreaSize / 2);
  // Top Left corner of the area and its size
  var focusAreaPixels = {
    left: x - focusAreaHalfSide,
    top: y - focusAreaHalfSide,
    right: x + focusAreaHalfSide,
    bottom: y + focusAreaHalfSide,
    width: focusAreaSize,
    height: focusAreaSize
  };
  var camera = this.app.settings.cameras.selected('key');
  var isFrontCamera = camera === 'front';
  var focusArea = cameraCoordinates.faceToCamera(
    focusAreaPixels, viewportWidth, viewportHeight, sensorAngle, isFrontCamera);
  var focusPoint = {
    x: x,
    y: y,
    area: focusArea
  };
  this.views.focus.setPosition(x, y);
  this.app.emit('viewfinder:focuspointchanged', focusPoint);
};

ViewfinderController.prototype.onSettingsOpened = function() {
  this.hideGrid();
  // Make viewfinder invisible to the screen reader since it is behind settings
  // overlay.
  this.views.viewfinder.set('ariaHidden', true);
};

ViewfinderController.prototype.onSettingsClosed = function() {
  this.configureGrid();
  // Make viewfinder visible to the screen reader again when settings are
  // closed.
  this.views.viewfinder.set('ariaHidden', false);
};

/**
 * Disables the viewfinder stream
 * and pinch events.
 *
 * @private
 */
ViewfinderController.prototype.onGalleryOpened = function() {
  this.views.viewfinder.disable();
};

/**
 * Enables the viewfinder stream
 * and pinch events.
 *
 * @private
 */
ViewfinderController.prototype.onGalleryClosed = function() {
  this.views.viewfinder.enable();
};

ViewfinderController.prototype.onPreviewActive = function(active) {
  if (!active) {
    this.stopStream();
  }
};

});
define('lib/format-recorder-profiles',['require','exports','module'],function(require, exports, module) {


/**
 * Returns a formatted list of recorder
 * profiles ready to be set as setting options.
 *
 * Options:
 *
 *   - `exclude {Array}`
 *
 * @param  {Object} profiles
 * @param  {Object} options
 * @return {Array}
 */
module.exports = function(profiles, options) {
  var exclude = options && options.exclude || [];
  var formatted = [];
  var pixelSize;
  var profile;
  var video;

  for (var key in profiles) {
    // Bug 1091820 - [Camera] Add hasOwnProperty() check to recorderProfiles
    // loop
    if (!profiles.hasOwnProperty(key)) {
      continue;
    }

    profile = profiles[key];
    video = profile.video;

    // Don't include profile if marked as excluded
    if (exclude.indexOf(key) > -1) { continue; }

    pixelSize = video.width * video.height;

    formatted.push({
      key: key,
      title: key + ' ' + video.width + 'x' + video.height,
      pixelSize: pixelSize,
      raw: profile
    });
  }

  formatted.sort(function(a, b) { return b.pixelSize - a.pixelSize; });
  return formatted;
};

});

define('lib/format-picture-sizes',['require','exports','module'],function(require, exports, module) {


/**
 * Returns a formatted list of picture
 * sizes ready to be set as setting options.
 *
 * Options:
 *
 *   - `maxPixelSize {Number}`
 *   - `exclude {Array}`
 *
 * @param  {Array} sizes
 * @param  {Object} options
 * @return {Array}
 */
module.exports = function(sizes, options) {
  var maxPixelSize = options && options.maxPixelSize;
  var exclude = options && options.exclude || {};
  var formatted = [];

  exclude.aspects = exclude.aspects || [];
  exclude.keys = exclude.keys || [];

  sizes.forEach(function(size) {
    var w = size.width;
    var h = size.height;
    var key = w + 'x' + h;
    var pixelSize = w * h;

    size.aspect = getAspect(w, h);

    // Don't include pictureSizes above the maxPixelSize limit
    if (maxPixelSize && pixelSize > maxPixelSize) { return; }

    // Don't include picture size if marked as excluded
    if (exclude.keys.indexOf(key) > -1) { return; }
    if (exclude.aspects.indexOf(size.aspect) > -1) { return; }


    size.mp = getMP(w, h);

    formatted.push({
      key: key,
      pixelSize: pixelSize,
      data: size
    });
  });

  // Sort by pixel size
  formatted.sort(function(a, b) { return b.pixelSize - a.pixelSize; });
  return formatted;
};

/**
 * Returns rounded mega-pixel value.
 *
 * @param  {Number} w
 * @param  {Number} h
 * @return {Number}
 */
function getMP(w, h) {
  return Math.round((w * h) / 1000000);
}

/**
 * Returns aspect ratio string.
 *
 * Makes use of Euclid's GCD algorithm,
 * http://en.wikipedia.org/wiki/Euclidean_algorithm
 *
 * @param  {Number} w
 * @param  {Number} h
 * @return {String}
 */
function getAspect(w, h) {
  var gcd = function(a, b) { return (b === 0) ? a : gcd(b, a % b); };
  var divisor = gcd(w, h);
  return (w / divisor) + ':' + (h / divisor);
}

});

;(function() {


/**
 * Namespace to store
 * references under on root
 */

var ns = '_attach';

/**
 * Normalize `matchesSelector`
 */

var proto = Element.prototype;
var matches = proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

/**
 * Bind an event listener
 * to the given element.
 *
 * Example:
 *
 *   attach(myEl, 'click', '.my-class', function(event, el) {
 *     // Do stuff
 *   });
 *
 * @param  {Element}  root
 * @param  {String}   type
 * @param  {String}   selector (optional)
 * @param  {Function} fn
 * @param  {Object}   ctx (optional)
 */
function attach(root, type, selector, fn, ctx) {
  if (arguments.length === 2) {
    return attach.many.apply(null, arguments);
  }

  // `selector` is optional
  if (typeof selector === 'function') {
    ctx = fn;
    fn = selector;
    selector = null;
  }

  // We use the key 'null' to
  // indicate that we are binding
  // an event handler to the root.
  selector = selector || 'null';

  var store = getStore(root);
  var master = store.master[type];
  var delegates = store.delegates[type] = (store.delegates[type] || {});

  // Add the function to the delegates
  delegates[selector] = fn;

  // Only one master event listener
  // is needed per event type.
  if (master) { return; }

  // Add the master callbak to the
  // root node and to the store.
  master = store.master[type] = callback;
  root.addEventListener(type, master);

  /**
   * The master callback passed
   * to `addEventListener`.
   *
   * @param  {Event}   event
   */
  function callback(e) {
    var el = e.target;
    var selector;
    var matched;
    var out;
    var fn;

    // Walk up the DOM tree
    // until we hit the root
    while (el) {

      // Loop over each selector
      // bound to this e type.
      for (selector in delegates) {
        fn = delegates[selector];

        // There are two types of match. A
        // 'null' selector at the root node,
        // or a selector match on the current el.
        matched = (el === root && selector === 'null') ||
          matches.call(el, selector);

        if (matched) {
          out = fn.call(ctx || el, e, el);

          // Stop propagation if the
          // user returns false from the
          // callback. Ideally we would
          // use .stopPropagation, but I
          // don't know of any way to detect
          // if this has been called.
          if (out === false) { return e.stopPropagation(); }
        }
      }

      // Don't go any higher
      // than the root element.
      if (el == root) break;

      // Move on up!
      el = el.parentNode;
    }
  }
}

attach.on = attach;

/**
 * Unbind an event attach
 * from the given root element.
 *
 * If no selector if given, all
 * callbacks for the given event
 * type are removed.
 *
 * Example:
 *
 *   // Remove one
 *   attach.off(myEl, 'click', '.my-class');
 *
 *   // Remove all
 *   attach.off(myEl, 'click');
 *
 * @param  {Element} root
 * @param  {String} type (optional)
 * @param  {String} selector (optional)
 */
attach.off = function(root, type, selector) {
  var store = getStore(root);
  var master = store.master[type];
  var delegates = store.delegates[type];

  // Remove just one
  if (type && selector) {
    delete delegates[selector];
  }

  // Remove all of type
  else if (type) {
    delete store.delegates[type];
  }

  // Remove all
  else {
    for (type in store.master) {
      attach.off(root, type);
    }
  }

  // If there aren't any callbacks
  // of this type left, remove the master.
  if (isEmpty(store.delegates[type])) {
    root.removeEventListener(type, master);
    delete store.master[type];
  }
};

/**
 * Handles Backbone style
 * shorthand event binding.
 *
 * Example:
 *
 *   attach(myElement, {
 *     'click .foo': onFooClick,
 *     'click .bar': onBarClick
 *   });
 *
 * @param  {element} root
 * @param  {Object} config
 * @param  {Object} ctx
 */
attach.many = function(root, config, ctx) {
  var parts;
  var key;

  for (key in config) {
    parts = key.split(' ');
    attach.on(
      root,
      parts[0],
      parts[1],
      config[key],
      ctx);
  }
};

/**
 * Gets the reference store
 * attached to the given node.
 *
 * If one is not found, we
 * create a fresh one.
 *
 * @param  {Element} el
 * @return {Object}
 */
function getStore(el) {
  return el[ns] || createStore(el);
}

/**
 * Creates a fresh reference
 * store on the given element.
 *
 * @param  {Element} el
 * @return {Object}
 */
function createStore(el) {
  el[ns] = { master: {}, delegates: {} };
  return el[ns];
}

/**
 * Checks if the given
 * element has no keys.
 *
 * @param  {Object}  ob
 * @return {Boolean}
 */
function isEmpty(ob) {
  for (var key in ob) { return false; }
  return true;
}

/**
 * Expose 'attach' (UMD)
 */

if (typeof exports === "object") {
  module.exports = attach;
} else if (typeof define === "function" && define.amd) {
  define('attach',[],function(){ return attach; });
} else {
  window.attach = attach;
}

})();
define('views/setting-options',['require','exports','module','debug','attach','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:setting-options');
var attach = require('attach');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'setting-options',

  initialize: function(options) {
    this.model = options.model;
    this.l10n = options.l10n || navigator.mozL10n;
    this.on('destroy', this.onDestroy);
    attach(this.el, 'click', 'li', this.onOptionClick);
    attach(this.el, 'click', '.js-back', this.firer('click:back'));
    this.model.on('change:selected', this.onSelectedChange);
    debug('initialized');
  },

  onDestroy: function() {
    this.model.off('change:selected', this.onSelectedChange);
  },

  onOptionClick: function(event, el) {
    var key = el.getAttribute('data-key');
    this.emit('click:option', key, this.model);
  },

  onSelectedChange: function(key) {
    var next = this.els[key];
    this.els.selected.classList.remove('selected');
    next.classList.add('selected');
    this.els.selected = next;
  },

  render: function() {
    var data = this.model.get();
    this.selectedKey = data.selected;
    this.el.innerHTML = this.template(data);
    this.els.ul = this.find('.js-list');

    // we need to pass a boolean flag indicating if the
    // options should be localized
    var localizable = data.optionsLocalizable === false ? false : true;
    data.options.forEach(this.renderOption.bind(this, localizable));

    // Clean up
    delete this.template;

    debug('rendered');
    return this;
  },

  renderOption: function(localizable, option) {
    var li = document.createElement('li');
    var isSelected = option.key === this.selectedKey;

    li.textContent = localizable ? this.l10n.get(option.title) : option.title;
    li.setAttribute('data-key', option.key);
    // The settings options list is a listbox (list of actionable items) thus
    // each iteam must have an 'option' role.
    li.setAttribute('role', 'option');
    li.className = 'setting-option';
    // The only way to exclude content from :before element (present in setting
    // option item) is to override it with ARIA label.
    this.l10n.setAttributes(li, 'setting-option', { value: li.textContent });
    li.dataset.icon = 'tick';
    this.els.ul.appendChild(li);
    this.els[option.key] = li;

    if (isSelected) {
      li.classList.add('selected');
      // Make sure selected semantics is conveyed to the screen reader.
      li.setAttribute('aria-selected', true);
      this.els.selected = li;
    }
  },

  template: function(data) {
    return '<div class="inner">' +
      '<div class="settings_header">' +
        '<div class="settings-back-btn js-back" ' +
          'data-icon="back" role="button" data-l10n-id="back-button"></div>' +
        '<h2 aria-level="1" class="settings_title" data-l10n-id="' +
          data.header + '"></h2>' +
      '</div>' +
      '<div class="settings_items">' +
        '<ul role="listbox" class="inner js-list"></ul>' +
      '</div>' +
    '</div>';
  }
});

});

define('views/setting',['require','exports','module','debug','lib/bind','view'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:setting');
var bind = require('lib/bind');
var View = require('view');

/**
 * Exports
 */

module.exports = View.extend({
  tag: 'li',
  name: 'setting',

  initialize: function(options) {
    this.l10n = options.l10n || navigator.mozL10n;
    this.model = options.model;
    this.model.on('change', this.render);
    this.on('destroy', this.onDestroy);
    this.el.dataset.icon = this.model.get('icon');
    this.el.classList.add('test-' + this.model.get('title') + '-setting');
    bind(this.el, 'click', this.onClick);
  },

  onClick: function() {
    this.emit('click', this);
  },

  onDestroy: function() {
    this.model.off('change', this.render);
  },

  render: function() {
    var data = this.model.get();

    data.selected = this.model.selected();
    data.value = data.selected && data.selected.title;

    // The settings list is a listbox (list of actionable items) thus the
    // setting must be an 'option'.
    this.el.setAttribute('role', 'option');
    // The only way to exclude content from :before element (present in setting
    // item) is to override it with ARIA label.
    this.l10n.setAttributes(this.el, 'setting-option-' + data.title, {
      value: this.localizeValue(data)
    });

    this.el.innerHTML = this.template(data);

    // Clean up
    delete this.template;

    debug('rendered (item %s)', data.key);
    return this;
  },

  localizeValue: function(data) {
    // some data items are not to be localized
    if (data.optionsLocalizable === false) {
      return data.value;
    } else {
      return this.l10n.get(data.value);
    }
  },

  template: function(data) {
    return '<div class="setting_text">' +
      '<h4 class="setting_title" data-l10n-id="' + data.title + '"></h4>' +
      '<h5 class="setting_value">' + this.localizeValue(data) + '</h5>' +
    '</div>';
  },
});

});

define('views/settings',['require','exports','module','debug','views/setting-options','views/setting','view','lib/bind'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('view:settings');
var OptionsView = require('views/setting-options');
var SettingView = require('views/setting');
var View = require('view');
var bind = require('lib/bind');

/**
 * Exports
 */

module.exports = View.extend({
  name: 'settings',
  fadeTime: 150,

  initialize: function(options) {
    this.OptionsView = options.OptionsView || OptionsView;
    this.items = options.items;
    this.children = [];
    this.on('destroy', this.onDestroy);
    bind(this.el, 'click', this.onClick);
  },

  onClick: function(e) {
    e.stopPropagation();
  },

  onItemClick: function(view) {
    this.showSetting(view.model);
  },

  showSetting: function(model) {
    this.optionsView = new this.OptionsView({ model: model })
      .render()
      .appendTo(this.els.pane2)
      .on('click:option', this.firer('click:option'))
      .on('click:back', this.goBack);

    this.showPane(2);
  },

  onDestroy: function() {
    this.children.forEach(this.destroyChild);
    this.destroyOptionsView();
    debug('destroyed');
  },

  render: function() {
    this.el.innerHTML = this.template();
    this.els.items = this.find('.js-items');
    this.els.pane2 = this.find('.js-pane-2');
    this.els.close = this.find('.js-close');
    this.items.forEach(this.addItem);

    // Clean up
    delete this.template;

    debug('rendered');
    return this.bindEvents();
  },

  bindEvents: function() {
    bind(this.els.close, 'click', this.firer('click:close'));
    return this;
  },

  goBack: function() {
    this.showPane(1);
    this.destroyOptionsView();
  },

  destroyChild: function(view) {
    view.destroy();
    debug('destroyed child');
  },

  destroyOptionsView: function() {
    if (this.optionsView) {
      this.optionsView.destroy();
      this.optionsView = null;
      debug('options view destroyed');
    }
  },

  addItem: function(model) {
    var setting = new SettingView({ model: model })
      .render()
      .appendTo(this.els.items)
      .on('click', this.onItemClick);

    this.children.push(setting);
    debug('add item key: %s', model.key);
  },

  showPane: function(name) {
    this.el.setAttribute('show-pane', 'pane-' + name);
  },

  fadeIn: function(done) {
    setTimeout(this.show);
    if (!done) { return; }
    setTimeout(done, this.fadeTime);
  },

  fadeOut: function(done) {
    this.hide();
    if (!done) { return; }
    setTimeout(done, this.fadeTime);
  },

  template: function() {
    return '<div class="pane pane-1">' +
      '<div class="inner">' +
        '<div class="settings_inner">' +
          '<div class="settings_header">' +
            '<h2 class="settings_title" data-l10n-id="options" ' +
              'aria-level="1"></h2>' +
          '</div>' +
          '<div class="settings_items">' +
            '<ul class="inner js-items" role="listbox"></ul>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="pane pane-2">' +
      '<div class="inner js-pane-2"></div>' +
    '</div>' +
    '<div role="button" class="settings_close js-close" data-icon="menu" ' +
      'data-l10n-id="close-menu-button"></div>';
  }
});

});

define('controllers/settings',['require','exports','module','lib/format-recorder-profiles','lib/format-picture-sizes','debug','views/settings','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var formatRecorderProfiles = require('lib/format-recorder-profiles');
var formatPictureSizes = require('lib/format-picture-sizes');
var debug = require('debug')('controller:settings');
var SettingsView = require('views/settings');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new SettingsController(app); };
module.exports.SettingsController = SettingsController;

/**
 * Initialize a new `SettingsController`
 *
 * @constructor
 * @param {App} app
 */
function SettingsController(app) {
  bindAll(this);
  this.app = app;
  this.settings = app.settings;
  this.activity = app.activity;
  this.notification = app.views.notification;
  this.l10nGet = app.l10nGet;

  // Provide test hooks
  this.nav = app.nav || navigator;
  this.SettingsView = app.SettingsView || SettingsView;
  this.formatPictureSizes = app.formatPictureSizes || formatPictureSizes;
  this.formatRecorderProfiles = app.formatRecorderProfiles ||
    formatRecorderProfiles;

  this.configure();
  this.bindEvents();
  debug('initialized');
}

/**
 * Registers settings 'aliases' that provide
 * a single interface for settings such as
 * `flashModes` where we have `flashModesPicture`
 * and `flashModesVideo`.
 *
 * This means that we can just use settings.flashModes,
 * and be confident that it will interface with the
 * correct setting depending on the value of `mode`.
 *
 * You can always use the underlying settings
 * directly if you need that kind of control.
 * @return {[type]} [description]
 */
SettingsController.prototype.configure = function() {
  this.setupRecorderProfilesAlias();
  this.setupPictureSizesAlias();
  this.setupFlashModesAlias();
};

/**
 * Creates a SettingAlias that dynamically
 * interfaces with the correct recorder
 * profile Setting based on which camera
 * ('front'/'back') is selected.
 *
 * @private
 */
SettingsController.prototype.setupRecorderProfilesAlias = function() {
  var settings = this.settings;
  this.settings.alias({
    key: 'recorderProfiles',
    settings: {
      back: this.settings.recorderProfilesBack,
      front: this.settings.recorderProfilesFront
    },
    get: function() {
      var camera = settings.cameras.selected('key');
      return this.settings[camera];
    }
  });
};

/**
 * Creates a SettingAlias that dynamically
 * interfaces with the correct picture
 * size Setting based on which camera
 * ('front'/'back') is selected.
 *
 * @private
 */
SettingsController.prototype.setupPictureSizesAlias = function() {
  var settings = this.settings;
  this.settings.alias({
    key: 'pictureSizes',
    settings: {
      back: this.settings.pictureSizesBack,
      front: this.settings.pictureSizesFront
    },
    get: function() {
      var camera = settings.cameras.selected('key');
      return this.settings[camera];
    }
  });
};

/**
 * Creates a SettingAlias that dynamically
 * interfaces with the correct flash-modes
 * Setting based on which mode ('picture'/
 * 'video') is selected.
 *
 * @private
 */
SettingsController.prototype.setupFlashModesAlias = function() {
  var settings = this.settings;
  this.settings.alias({
    key: 'flashModes',
    settings: {
      picture: this.settings.flashModesPicture,
      video: this.settings.flashModesVideo
    },
    get: function() {
      var mode = settings.mode.selected('key');
      return this.settings[mode];
    }
  });
};

/**
 * Bind to app events.
 *
 * @private
 */
SettingsController.prototype.bindEvents = function() {
  this.app.on('localized', this.formatPictureSizeTitles);
  this.app.on('settings:toggle', this.toggleSettings);
  this.app.on('camera:newcamera', this.onNewCamera);
  this.app.on('activity:pick', this.onPickActivity);
};

/**
 * Toggle the settings menu open/closed.
 *
 * @private
 */
SettingsController.prototype.toggleSettings = function() {
  if (this.view) { this.closeSettings(); }
  else { this.openSettings(); }
};

/**
 * Render and display the settings menu.
 *
 * We use settings.menu() to retrieve
 * and ordered list of settings that
 * have a `menu` property.
 *
 * @private
 */
SettingsController.prototype.openSettings = function() {
  debug('open settings');
  if (this.view) { return; }

  var items = this.menuItems();
  this.view = new this.SettingsView({ items: items })
    .render()
    .appendTo(this.app.el)
    .on('click:close', this.closeSettings)
    .on('click:option', this.onOptionTap);

  // Make sure the view is
  // hidden before fading in
  this.view.hide();
  this.view.fadeIn();

  this.app.emit('settings:opened');
  debug('settings opened');
};

/**
 * Destroy the settings menu.
 *
 * @private
 */
SettingsController.prototype.closeSettings = function(done) {
  debug('close settings');
  if (!this.view) { return; }
  var self = this;
  this.view.fadeOut(function() {
    self.view.destroy();
    self.view = null;
    self.app.emit('settings:closed');
    debug('settings closed');
    if (typeof done === 'function') { done(); }
  });
};

/**
 * Selects the option that was
 * clicked on the setting.
 *
 * @param  {String} key
 * @param  {Setting} setting
 * @private
 */
SettingsController.prototype.onOptionTap = function(key, setting) {
  var flashMode = this.settings.flashModesPicture.selected('key');
  var ishdrOn = setting.key === 'hdr' && key === 'on';
  var flashDeactivated = flashMode !== 'off' && ishdrOn;
  var self = this;

  self.closeSettings(function() {
    setting.select(key);
    self.notify(setting, flashDeactivated);
  });
};

/**
 * Adjusts settings to meet requirements
 * on new pick activity.
 *
 * @param  {Object} data
 * @private
 */
SettingsController.prototype.onPickActivity = function(data) {
  debug('pick activity', data);

  var setting;
  var options;
  var updated = false;
  var maxFileSize = data.maxFileSizeBytes;
  var maxPixelSize = data.maxPixelSize;

  // Settings changes made in 'pick'
  // sessions shouldn't persist.
  this.settings.dontSave();

  if (maxPixelSize) {
    setting = this.settings.pictureSizes;
    var lastMaxPixelSize = setting.get('maxPixelSize');

    this.settings.pictureSizesFront.set('maxPixelSize', maxPixelSize);
    this.settings.pictureSizesBack.set('maxPixelSize', maxPixelSize);
    debug('set maxPixelSize: %s', maxPixelSize);

    if (lastMaxPixelSize !== maxPixelSize) {
      options = setting.get('options');
      var restricted = [];
      if (options && options.length > 0) {
        options.forEach(function(option) {
          if (option.pixelSize <= maxPixelSize) {
            restricted.push(option);
          }
        });
        setting.resetOptions(restricted);
        updated = true;
      }
    }
  }

  if (maxFileSize) {
    setting = this.settings.recorderProfiles;
    var lastMaxFileSize = setting.get('maxFileSizeBytes');

    this.settings.recorderProfilesFront.set('maxFileSizeBytes', maxFileSize);
    this.settings.recorderProfilesBack.set('maxFileSizeBytes', maxFileSize);
    debug('set maxFileSize: %s', maxFileSize);

    if (lastMaxFileSize !== maxFileSize) {
      options = setting.get('options');
      if (options && options.length > 1) {
        setting.resetOptions([options[options.length - 1]]);
        updated = true;
      }
    }
  }

  // If the size restrictions come in after the camera was brought
  // up, then we must retrigger a configuration event
  if (updated) {
    this.app.emit('settings:configured');
  }
};

/**
 * Display a notifcation showing the
 * current state of the given setting.
 *
 * If `notification` is `false in config
 * for a setting then we don't show one.
 *
 * @param  {Setting} setting
 * @private
 */
SettingsController.prototype.notify = function(setting, flashDeactivated) {
  var dontNotify = setting.get('notifications') === false;
  if (dontNotify) { return; }

  var localizeOption = setting.get('optionsLocalizable') !== false;
  var title = this.l10nGet(setting.get('title'));
  var optionTitle = setting.selected('title');
  var html;

  // Localize option title only if not specified in the config
  optionTitle = localizeOption ? this.l10nGet(optionTitle) : optionTitle;

  // Check if the `flashMode` setting is going to be deactivated as part
  // of the change in the `hdr` setting and display a specialized
  // notification if that is the case
  if (flashDeactivated) {
    html = title + ' ' + optionTitle + '<br/>' +
      this.l10nGet('flash-deactivated');
  } else {
    html = title + '<br/>' + optionTitle;
  }

  this.notification.display({ text: html });
};

/**
 * When the hardware capabilities change
 * we update the available options for
 * each setting to match what is available.
 *
 * The rest of the app should listen for
 * the 'settings:configured' event as an
 * indication to update UI etc.
 *
 * @param  {Object} capabilities
 */
SettingsController.prototype.onNewCamera = function(capabilities) {
  debug('new capabilities');

  this.settings.hdr.filterOptions(capabilities.hdr);
  this.settings.flashModesPicture.filterOptions(capabilities.flashModes);
  this.settings.flashModesVideo.filterOptions(capabilities.flashModes);

  this.configurePictureSizes(capabilities.pictureSizes);
  this.configureRecorderProfiles(capabilities.recorderProfiles);

  // Let the rest of the app know we're good to go.
  this.app.emit('settings:configured');
  debug('settings configured to new capabilities');
};

/**
 * Formats the raw pictureSizes into
 * a format that Setting class can
 * work with, then resets the pictureSize
 * options.
 *
 * @param  {Array} sizes
 */
SettingsController.prototype.configurePictureSizes = function(sizes) {
  debug('configuring picture sizes');
  var setting = this.settings.pictureSizes;
  var maxPixelSize = window.CONFIG_MAX_IMAGE_PIXEL_SIZE;
  var exclude = setting.get('exclude');
  var options = {
    exclude: exclude,
    maxPixelSize: maxPixelSize
  };

  var formatted = this.formatPictureSizes(sizes, options);
  setting.resetOptions(formatted);
  this.formatPictureSizeTitles();
  debug('configured pictureSizes', setting.selected('key'));
};

/**
 * Formats the raw recorderProfiles
 * into a format that Setting class can
 * work with, then resets the recorderProfile
 * options.
 *
 * @param  {Array} sizes
 */
SettingsController.prototype.configureRecorderProfiles = function(sizes) {
  var setting = this.settings.recorderProfiles;
  var maxFileSize = setting.get('maxFileSizeBytes');
  var exclude = setting.get('exclude');
  var options = { exclude: exclude };
  var formatted = this.formatRecorderProfiles(sizes, options);

  // If a file size limit has been imposed,
  // pick the lowest-res (last) profile only.
  if (maxFileSize) { formatted = [formatted[formatted.length - 1]]; }

  setting.resetOptions(formatted);
};

/**
 * Creates a localized `title` property
 * on each pictureSize option. This is
 * used within the settings-menu.
 *
 * This is run each time `configurePictureSizes`
 * is run and each time the app recieves a
 * 'localized' event.
 *
 * If the app isn't 'localized' yet, we don't do
 * anything and wait for the 'localized'
 * event binding to run the function.
 *
 * @private
 */
SettingsController.prototype.formatPictureSizeTitles = function() {
  if (!this.app.localized()) { return; }
  var options = this.settings.pictureSizes.get('options');
  var MP = this.l10nGet('mp');

  options.forEach(function(size) {
    var data = size.data;
    var mp = data.mp ? data.mp + MP + ' ' : '';
    size.title = mp + data.width + 'x' + data.height + ' ' + data.aspect;
  });

  debug('picture size titles formatted');
};

/**
 * Returns a list of settings
 * based on the `settingsMenu`
 * configuration.
 *
 * @return {Array}
 */
SettingsController.prototype.menuItems = function() {
  var items = this.settings.settingsMenu.get('items');
  return items.filter(this.validMenuItem, this)
    .map(function(item) { return this.settings[item.key]; }, this);
};

/**
 * Tests if the passed `settingsMenu`
 * item is allowed in the settings menu.
 *
 * @param  {Object} item
 * @return {Boolean}
 */
SettingsController.prototype.validMenuItem = function(item) {
  var setting = this.settings[item.key];
  return !!setting && setting.supported();
};

});

define('lib/bytes-to-pixels',['require','exports','module'],function(require, exports, module) {


module.exports = function(bytes) {
  var bytesPerPixel = 3;
  var avgJpegCompression = window.CONFIG_AVG_JPEG_COMPRESSION_RATIO || 8;
  var uncompressedBytes = bytes * avgJpegCompression;
  return Math.round(uncompressedBytes / bytesPerPixel);
};

});
/* globals indexedDB */
/**
 * This file defines an asynchronous version of the localStorage API, backed by
 * an IndexedDB database.  It creates a global asyncStorage object that has
 * methods like the localStorage object.
 *
 * To store a value use setItem:
 *
 *   asyncStorage.setItem('key', 'value');
 *
 * If you want confirmation that the value has been stored, pass a callback
 * function as the third argument:
 *
 *  asyncStorage.setItem('key', 'newvalue', function() {
 *    console.log('new value stored');
 *  });
 *
 * To read a value, call getItem(), but note that you must supply a callback
 * function that the value will be passed to asynchronously:
 *
 *  asyncStorage.getItem('key', function(value) {
 *    console.log('The value of key is:', value);
 *  });
 *
 * Note that unlike localStorage, asyncStorage does not allow you to store and
 * retrieve values by setting and querying properties directly. You cannot just
 * write asyncStorage.key; you have to explicitly call setItem() or getItem().
 *
 * removeItem(), clear(), length(), and key() are like the same-named methods of
 * localStorage, but, like getItem() and setItem() they take a callback
 * argument.
 *
 * The asynchronous nature of getItem() makes it tricky to retrieve multiple
 * values. But unlike localStorage, asyncStorage does not require the values you
 * store to be strings.  So if you need to save multiple values and want to
 * retrieve them together, in a single asynchronous operation, just group the
 * values into a single object. The properties of this object may not include
 * DOM elements, but they may include things like Blobs and typed arrays.
 *
 * Unit tests are in apps/gallery/test/unit/asyncStorage_test.js
 */

this.asyncStorage = (function() {
  

  var DBNAME = 'asyncStorage';
  var DBVERSION = 1;
  var STORENAME = 'keyvaluepairs';
  var db = null;

  function withDatabase(f) {
    if (db) {
      f();
    } else {
      var openreq = indexedDB.open(DBNAME, DBVERSION);
      openreq.onerror = function withStoreOnError() {
        console.error('asyncStorage: can\'t open database:',
            openreq.error.name);
      };
      openreq.onupgradeneeded = function withStoreOnUpgradeNeeded() {
        // First time setup: create an empty object store
        openreq.result.createObjectStore(STORENAME);
      };
      openreq.onsuccess = function withStoreOnSuccess() {
        db = openreq.result;
        f();
      };
    }
  }

  function withStore(type, callback, oncomplete) {
    withDatabase(function() {
      var transaction = db.transaction(STORENAME, type);
      if (oncomplete) {
        transaction.oncomplete = oncomplete;
      }
      callback(transaction.objectStore(STORENAME));
    });
  }

  function getItem(key, callback) {
    var req;
    withStore('readonly', function getItemBody(store) {
      req = store.get(key);
      req.onerror = function getItemOnError() {
        console.error('Error in asyncStorage.getItem(): ', req.error.name);
      };
    }, function onComplete() {
      var value = req.result;
      if (value === undefined) {
        value = null;
      }
      callback(value);
    });
  }

  function setItem(key, value, callback) {
    withStore('readwrite', function setItemBody(store) {
      var req = store.put(value, key);
      req.onerror = function setItemOnError() {
        console.error('Error in asyncStorage.setItem(): ', req.error.name);
      };
    }, callback);
  }

  function removeItem(key, callback) {
    withStore('readwrite', function removeItemBody(store) {
      var req = store.delete(key);
      req.onerror = function removeItemOnError() {
        console.error('Error in asyncStorage.removeItem(): ', req.error.name);
      };
    }, callback);
  }

  function clear(callback) {
    withStore('readwrite', function clearBody(store) {
      var req = store.clear();
      req.onerror = function clearOnError() {
        console.error('Error in asyncStorage.clear(): ', req.error.name);
      };
    }, callback);
  }

  function length(callback) {
    var req;
    withStore('readonly', function lengthBody(store) {
      req = store.count();
      req.onerror = function lengthOnError() {
        console.error('Error in asyncStorage.length(): ', req.error.name);
      };
    }, function onComplete() {
      callback(req.result);
    });
  }

  function key(n, callback) {
    if (n < 0) {
      callback(null);
      return;
    }

    var req;
    withStore('readonly', function keyBody(store) {
      var advanced = false;
      req = store.openCursor();
      req.onsuccess = function keyOnSuccess() {
        var cursor = req.result;
        if (!cursor) {
          // this means there weren't enough keys
          return;
        }
        if (n === 0 || advanced) {
          // Either 1) we have the first key, return it if that's what they
          // wanted, or 2) we've got the nth key.
          return;
        }

        // Otherwise, ask the cursor to skip ahead n records
        advanced = true;
        cursor.advance(n);
      };
      req.onerror = function keyOnError() {
        console.error('Error in asyncStorage.key(): ', req.error.name);
      };
    }, function onComplete() {
      var cursor = req.result;
      callback(cursor ? cursor.key : null);
    });
  }

  return {
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    length: length,
    key: key
  };
}());


define("asyncStorage", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.asyncStorage;
    };
}(this)));

/* exported Format */


/**
 * format.js: simple formatters and string utilities.
 */

var Format = {

  /**
   * Pads a string to the number of characters specified.
   * @param {String} input value to add padding to.
   * @param {Integer} len length to pad to.
   * @param {String} padWith char to pad with (defaults to " ").
   */
  padLeft: function(input, len, padWith) {
    padWith = padWith || ' ';

    var pad = len - (input + '').length;
    while (--pad > -1) {
      input = padWith + input;
    }
    return input;
  }
};

define("format", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Format;
    };
}(this)));

define('lib/dcf',['require','exports','module','asyncStorage','debug','format'],function(require, exports, module) {


// This handles the logic pertaining to the naming of files according
// to the Design rule for Camera File System
// * http://en.wikipedia.org/wiki/Design_rule_for_Camera_File_system

/**
 * Dependencies
 */

var asyncStorage = require('asyncStorage');
var debug = require('debug')('dcf');
var format = require('format');

/**
 * Locals
 */

var dcfConfigLoaded = false;
var deferredArgs = null;
var defaultSeq = {file: 1, dir: 100};
var dcfConfig = {
  key: 'dcf_key',
  seq: null,
  postFix: 'MZLLA',
  prefix: {video: 'VID_', image: 'IMG_'},
  ext: {video: '3gp', image: 'jpg'}
};

exports.init = function() {
  debug('initializing');
  asyncStorage.getItem(dcfConfig.key, function(value) {
    dcfConfigLoaded = true;
    dcfConfig.seq = value ? value : defaultSeq;

    // We have a previous call to createDCFFilename that is waiting for
    // a response, fire it again
    if (deferredArgs) {
      var args = deferredArgs;
      exports.createDCFFilename(args.storage, args.type, args.callback);
      deferredArgs = null;
    }

    debug('initialized');
  });
};

exports.createDCFFilename = function(storage, type, callback) {

  // We havent loaded the current counters from indexedDB yet, defer
  // the call
  if (!dcfConfigLoaded) {
    deferredArgs = {storage: storage, type: type, callback: callback};
    return;
  }

  var dir = 'DCIM/' + dcfConfig.seq.dir + dcfConfig.postFix + '/';
  var filename = dcfConfig.prefix[type] +
    format.padLeft(dcfConfig.seq.file, 4, '0') + '.' +
    dcfConfig.ext[type];
  var filepath = dir + filename;

  // A file with this name may have been written by the user or
  // our indexeddb sequence tracker was cleared, check we wont overwrite
  // anything
  var req = storage.get(filepath);

  // A file existed, we bump the directory then try to generate a
  // new filename
  req.onsuccess = function() {
    dcfConfig.seq.file = 1;
    dcfConfig.seq.dir += 1;
    asyncStorage.setItem(dcfConfig.key, dcfConfig.seq, function() {
      exports.createDCFFilename(storage, type, callback);
    });
  };

  // No file existed, we are good to go
  req.onerror = function() {
    if (dcfConfig.seq.file < 9999) {
      dcfConfig.seq.file += 1;
    } else {
      dcfConfig.seq.file = 1;
      dcfConfig.seq.dir += 1;
    }
    asyncStorage.setItem(dcfConfig.key, dcfConfig.seq, function() {
      callback(filepath, filename, dir);
    });
  };
};

});

define('lib/storage',['require','exports','module','debug','lib/bind-all','lib/dcf','evt'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('storage');
var bindAll = require('lib/bind-all');
var dcf = require('lib/dcf');
var events = require('evt');
var storageSingleton;

/**
 * Locals
 */

var createFilename = dcf.createDCFFilename;

/**
 * Expose `Storage`
 */

module.exports = Storage;

/**
 * Mixin event emitter
 */

events(Storage.prototype);

/**
 * Initialize a new `Storage`.
 *
 * @param {Object} options
 */
function Storage(options) {
  if (storageSingleton) {
    return storageSingleton;
  }
  storageSingleton = this;
  bindAll(this);
  this.maxFileSize = 0;
  options = options || {};
  this.createFilename = options.createFilename || createFilename; // test hook
  this.dcf = options.dcf || dcf;
  this.dcf.init();
  // navigator.mozSettings.addObserver(
  //   'device.storage.writable.name',
  //   this.onStorageVolumeChanged);
  this.configure();
  debug('initialized');
}

/**
 * Save the image Blob to DeviceStorage
 * then lookup the File reference and
 * return that in the callback as well
 * as the resulting paths.
 *
 * You always want to forget about the
 * Blob you told us about and use the
 * File instead since otherwise you
 * are wasting precious memory.
 *
 * @param {Object} [options]
 * @param {String} options.filepath
 *   The path to save the image to.
 */
Storage.prototype.addPicture = function(blob, options, done) {
  if (typeof options === 'function') {
    done = options;
    options = {};
  }

  done = done || function() {};
  var filepath = options && options.filepath;
  var self = this;
  debug('add picture', filepath);

  // Create a filepath if
  // one hasn't been given.
  if (!filepath) {
    debug('creating filename');
    this.createFilename(this.picture, 'image', onCreated);
  } else {
    onCreated(filepath);
  }

  function onCreated(filepath) {
    var req = self.picture.addNamed(blob, filepath);
    req.onerror = function() { self.emit('error'); };
    req.onsuccess = function(e) {
      debug('image stored', filepath);
      var absolutePath = e.target.result;

      // `addNamed` does not give us a File
      // handle so we need to get() it again.
      refetchFile(filepath, absolutePath);
    };
  }

  function refetchFile(filepath, absolutePath) {
    var req = self.picture.get(filepath);
    req.onerror = function() {
      self.emit('error');
      done('Error adding picture to storage');
    };
    req.onsuccess = function(e) {
      debug('image file blob handle retrieved');
      var fileBlob = e.target.result;
      done(null, filepath, absolutePath, fileBlob);
    };
  }
};

/**
 * Create a new video filepath.
 *
 * The CameraControl API will not
 * automatically create directories
 * for the new file if they do not
 * exist.
 *
 * So we write a dummy file to the
 * same directory via DeviceStorage
 * to ensure that the directory exists
 * before attempting to record to this
 * filepath.
 *
 * If the request errors it can mean that
 * there is a file that already exists
 * in that name. If so, we attempt to delete
 * it and try to create the filepath again.
 *
 * @param  {Function} done
 * @public
 */
Storage.prototype.createVideoFilepath = function(done) {
  var videoStorage = this.video;
  var self = this;

  this.createFilename(this.video, 'video', function(filepath) {
    var dummyFilepath = getDir(filepath) + '.tmp.3gp';
    var blob = new Blob([''], { type: 'video/3gpp' });
    var req = videoStorage.addNamed(blob, dummyFilepath);

    req.onerror = function(e) {
      debug('Failed to add' + filepath + 'to DeviceStorage', e);
      var req = videoStorage.delete(dummyFilepath);
      req.onerror = function() { done('Error creating video file path'); };
      req.onsuccess = function() { self.createVideoFilepath(done); };
    };

    req.onsuccess = function(e) {
      videoStorage.delete(e.target.result);
      done(null, filepath);
    };
  });
};

Storage.prototype.onStorageChange = function(e) {
  debug('state change: %s', e.reason);
  var value = e.reason;

  // Emit an `itemdeleted` event to
  // allow parts of the UI to update.
  if (value === 'deleted') {
    var filepath = this.checkFilepath(e.path);
    this.emit('itemdeleted', { path: filepath });
  } else {
    this.setState(value);
  }

  // Check storage
  // has spare capacity
  this.check();
};

Storage.prototype.configure = function(storageVolumeName) {
  var i;
  var videosStorages;
  var picturesStorages;
  // If we had a previous ds for pictures, let's remove the observer
  // we had set as well before fetching new ds.
  if (this.picture) {
    this.picture.removeEventListener('change', this.onStorageChange);
  }
  if (!storageVolumeName) {
    this.video = navigator.getDeviceStorage('videos');
    this.picture = navigator.getDeviceStorage('pictures');
  } else { // We select the volumes with the passed name
    videosStorages = navigator.getDeviceStorages('videos');
    this.video = videosStorages[0];
    for (i = 0; i < videosStorages.length; ++i) {
      if (videosStorages[i].storageName === storageVolumeName) {
        this.video = videosStorages[i];
        break;
      }
    }

    picturesStorages = navigator.getDeviceStorages('pictures');
    this.picture = picturesStorages[0];
    for (i = 0; i < picturesStorages.length; ++i) {
      if (picturesStorages[i].storageName === storageVolumeName) {
        this.picture = picturesStorages[i];
        break;
      }
    }
  }

  // Shouldn't happen?
  if (!this.picture) {
    this.setState('unavailable');
    return;
  }

  this.picture.addEventListener('change', this.onStorageChange);
  this.emit('volumechanged',{
    video: this.video,
    picture: this.picture
  });
};

Storage.prototype.onStorageVolumeChanged = function(setting) {
  debug('default storage volume change: %s', setting.settingValue);
  this.configure(setting.settingValue);
};

Storage.prototype.checkFilepath = function(filepath) {
  var startString = filepath.indexOf('DCIM/');

  if (startString < -1) { return; }
  else if (startString > 0) {
    filepath = filepath.substr(startString);
  }

  // Check whether filepath is a video poster image or not. If filepath
  // contains 'VID' and ends with '.jpg', consider it a video poster
  // image and get the video filepath by changing '.jpg' to '.3gp'
  if (filepath.indexOf('VID') != -1 &&
      filepath.lastIndexOf('.jpg') === filepath.length - 4) {
    filepath = filepath.replace('.jpg', '.3gp');
  }

  return filepath;
};

Storage.prototype.setState = function(value) {
  this.state = value;
  debug('set state: %s', value);
  this.emit('changed', value);
};

Storage.prototype.setMaxFileSize = function(maxFileSize) {
  this.maxFileSize = maxFileSize;
  this.check();
  debug('max file size set: %d', maxFileSize);
};

/**
 * Run a full storage check.
 *
 * @param  {Function} done
 * @public
 */
Storage.prototype.check = function(done) {
  debug('check');

  var self = this;
  done = done || function() {};

  this.getState(function(result) {
    self.setState(result);

    if (!self.available()) {
      onComplete('unhealthy');
      return;
    }

    self.isSpace(function(result) {
      if (!result) { self.setState('nospace'); }
      onComplete('healthy');
    });
  });

  function onComplete(state) {
    self.emit('checked', state);
  }
};

/**
 * Checks if there is enough space to
 * accomdate the current `maxFileSize`.
 *
 * @param  {Function} done
 */
Storage.prototype.isSpace = function(done) {
  var maxFileSize = this.maxFileSize;
  this.picture
    .freeSpace()
    .onsuccess = function(e) {
      var freeSpace = e.target.result;
      var result = freeSpace > maxFileSize;
      debug('is space: %s', result, freeSpace, maxFileSize);
      done(result);
    };
};

/**
 * Get current storage state.
 *
 * @param  {Function} done
 */
Storage.prototype.getState = function(done) {
  if (!this.picture) {
    setTimeout(function() {
      done('unavailable');
    });
    return;
  }

  this.picture
    .available()
    .onsuccess = function(e) {
      done(e.target.result);
    };
};

/**
 * States if sotrage is available.
 *
 * @return {Boolean}
 */
Storage.prototype.available = function() {
  return this.state === 'available';
};

/**
 * Delete a picture.
 *
 * @param  {String} filepath
 */
Storage.prototype.deletePicture = function(filepath, done) {
  var req = this.picture.delete(filepath);
  req.onerror = function(e) {
    var message = 'Failed to delete ' + filepath +
      ' from DeviceStorage:' + e.target.error;
    console.warn(message);
    done(message);
  };

  req.onsuccess = function() {
    done(null);
  };
};

/**
 * Delete a video and accompanying
 * poster image.
 *
 * @param  {String} filepath
 */
Storage.prototype.deleteVideo = function(filepath) {
  var poster = filepath.replace('.3gp', '.jpg');

  this.video.delete(filepath).onerror = function(e) {
    console.warn(
      'Failed to delete', filepath,
      'from DeviceStorage:', e.target.error);
  };

  this.picture.delete(poster).onerror = function(e) {
    console.warn(
      'Failed to delete poster image', poster,
      'for video', filepath,
      'from DeviceStorage:', e.target.error);
  };
};

/**
 * Get the directory from a filepath.
 *
 * @param  {String} filepath
 * @return {String}
 */
function getDir(filepath) {
  var index = filepath.lastIndexOf('/') + 1;
  return index ? filepath.substring(0, index) : '';
}

});



/* global BlobView */
/* exported parseJPEGMetadata */
//
// This file defines a single function that asynchronously reads a
// JPEG file (or blob) to determine its width and height and find the
// location and size of the embedded preview image, if it has one. If
// it succeeds, it passes an object containing this data to the
// specified callback function. If it fails, it passes an error message
// to the specified error function instead.
//
// This function is capable of parsing and returning EXIF data for a
// JPEG file, but for speed, it ignores all EXIF data except the embedded
// preview image and the image orientation.
//
// This function requires the BlobView utility class
//
function parseJPEGMetadata(file, metadataCallback, metadataError) {
  // This is the object we'll pass to metadataCallback
  var metadata = {};

  // Start off reading a 16kb slice of the JPEG file.
  // Hopefully, this will be all we need and everything else will
  // be synchronous
  BlobView.get(file, 0, Math.min(16 * 1024, file.size), function(data) {
    if (data.byteLength < 2 ||
        data.getUint8(0) !== 0xFF ||
        data.getUint8(1) !== 0xD8) {
      metadataError('Not a JPEG file');
      return;
    }

    // Now start reading JPEG segments
    // getSegment() and segmentHandler() are defined below.
    getSegment(data, 2, segmentHandler);
  });

  // Read the JPEG segment at the specified offset and
  // pass it to the callback function.
  // Offset is relative to the current data offsets.
  // We assume that data has enough data in it that we can
  // can determine the size of the segment, and we guarantee that
  // we read extra bytes so the next call works
  function getSegment(data, offset, callback) {
    try {
      var header = data.getUint8(offset);
      if (header !== 0xFF) {
        metadataError('Malformed JPEG file: bad segment header');
        return;
      }

      var type = data.getUint8(offset + 1);
      var size = data.getUint16(offset + 2) + 2;

      // the absolute position of the segment
      var start = data.sliceOffset + data.viewOffset + offset;
      // If this isn't the last segment in the file, add 4 bytes
      // so we can read the size of the next segment
      var isLast = (start + size >= file.size);
      var length = isLast ? size : size + 4;

      data.getMore(start, length,
                   function(data) {
                     callback(type, size, data, isLast);
                   });
    }
    catch (e) {
      metadataError(e.toString() + '\n' + e.stack);
    }
  }

  // This is a callback function for getNextSegment that handles the
  // various types of segments we expect to see in a jpeg file
  function segmentHandler(type, size, data, isLastSegment) {
    try {
      switch (type) {
      case 0xC0:  // Some actual image data, including image dimensions
      case 0xC1:
      case 0xC2:
      case 0xC3:
        // Get image dimensions
        metadata.height = data.getUint16(5);
        metadata.width = data.getUint16(7);

        if (type === 0xC2) {
          // pjpeg files can't be efficiently downsampled while decoded
          // so we need to distinguish them from regular jpegs
          metadata.progressive = true;
        }

        // We're done. All the EXIF data will come before this segment
        // So call the callback
        metadataCallback(metadata);
        break;

      case 0xE1:  // APP1 segment. Probably holds EXIF metadata
        parseAPP1(data);

      /* falls through */
      default:
        // A segment we don't care about, so just go on and read the next one
        if (isLastSegment) {
          metadataError('unexpected end of JPEG file');
          return;
        }
        getSegment(data, size, segmentHandler);
      }
    }
    catch (e) {
      metadataError(e.toString() + '\n' + e.stack);
    }
  }

  function parseAPP1(data) {
    if (data.getUint32(4, false) === 0x45786966) { // "Exif"
      var exif = parseEXIFData(data);

      if (exif.THUMBNAIL && exif.THUMBNAILLENGTH) {
        var start = data.sliceOffset + data.viewOffset + 10 + exif.THUMBNAIL;
        metadata.preview = {
          start: start,
          end: start + exif.THUMBNAILLENGTH
        };
      }

      // map exif orientation flags for easy transforms
      switch (exif.ORIENTATION) {
        case 2:
          metadata.rotation = 0;
          metadata.mirrored = true;
          break;
        case 3:
          metadata.rotation = 180;
          metadata.mirrored = false;
          break;
        case 4:
          metadata.rotation = 180;
          metadata.mirrored = true;
          break;
        case 5:
          metadata.rotation = 90;
          metadata.mirrored = true;
          break;
        case 6:
          metadata.rotation = 90;
          metadata.mirrored = false;
          break;
        case 7:
          metadata.rotation = 270;
          metadata.mirrored = true;
          break;
        case 8:
          metadata.rotation = 270;
          metadata.mirrored = false;
          break;
        default:
          // This is the default orientation. If it is properly encoded
          // we will get 1 here. But sometimes it is undefined and some
          // files have a 0 here as well.
          metadata.rotation = 0;
          metadata.mirrored = false;
          break;
      }
    }
  }

  // Parse an EXIF segment from a JPEG file and return an object
  // of metadata attributes. The argument must be a DataView object
  function parseEXIFData(data) {
    var exif = {};

    var byteorder = data.getUint8(10);
    if (byteorder === 0x4D) {  // big endian
      byteorder = false;
    } else if (byteorder === 0x49) {  // little endian
      byteorder = true;
    } else {
      throw Error('invalid byteorder in EXIF segment');
    }

    if (data.getUint16(12, byteorder) !== 42) { // magic number
      throw Error('bad magic number in EXIF segment');
    }

    var offset = data.getUint32(14, byteorder);

     // This is how we would parse all EXIF metadata more generally.
     // Especially need for iamge orientation
    parseIFD(data, offset + 10, byteorder, exif, true);

    // I'm leaving this code in as a comment in case we need other EXIF
    // data in the future.
    // if (exif.EXIFIFD) {
    //   parseIFD(data, exif.EXIFIFD + 10, byteorder, exif);
    //   delete exif.EXIFIFD;
    // }

    // if (exif.GPSIFD) {
    //   parseIFD(data, exif.GPSIFD + 10, byteorder, exif);
    //   delete exif.GPSIFD;
    // }

    // Instead of a general purpose EXIF parse, we're going to drill
    // down directly to the thumbnail image.
    // We're in IFD0 here. We want the offset of IFD1
    var ifd0entries = data.getUint16(offset + 10, byteorder);
    var ifd1 = data.getUint32(offset + 12 + 12 * ifd0entries, byteorder);
    // If there is an offset for IFD1, parse that
    if (ifd1 !== 0) {
      parseIFD(data, ifd1 + 10, byteorder, exif, true);
    }

    return exif;
  }

  function parseIFD(data, offset, byteorder, exif, onlyParseOne) {
    var numentries = data.getUint16(offset, byteorder);
    for (var i = 0; i < numentries; i++) {
      parseEntry(data, offset + 2 + 12 * i, byteorder, exif);
    }

    if (onlyParseOne) {
      return;
    }

    var next = data.getUint32(offset + 2 + 12 * numentries, byteorder);
    if (next !== 0 && next < file.size) {
      parseIFD(data, next + 10, byteorder, exif);
    }
  }

  // size, in bytes, of each TIFF data type
  var typesize = [
    0,   // Unused
    1,   // BYTE
    1,   // ASCII
    2,   // SHORT
    4,   // LONG
    8,   // RATIONAL
    1,   // SBYTE
    1,   // UNDEFINED
    2,   // SSHORT
    4,   // SLONG
    8,   // SRATIONAL
    4,   // FLOAT
    8    // DOUBLE
  ];

  // This object maps EXIF tag numbers to their names.
  // Only list the ones we want to bother parsing and returning.
  // All others will be ignored.
  var tagnames = {
    /*
     * We don't currently use any of these EXIF tags for anything.
     *
     *
     '256': 'ImageWidth',
     '257': 'ImageHeight',
     '40962': 'PixelXDimension',
     '40963': 'PixelYDimension',
     '306': 'DateTime',
     '315': 'Artist',
     '33432': 'Copyright',
     '36867': 'DateTimeOriginal',
     '33434': 'ExposureTime',
     '33437': 'FNumber',
     '34850': 'ExposureProgram',
     '34867': 'ISOSpeed',
     '37377': 'ShutterSpeedValue',
     '37378': 'ApertureValue',
     '37379': 'BrightnessValue',
     '37380': 'ExposureBiasValue',
     '37382': 'SubjectDistance',
     '37383': 'MeteringMode',
     '37384': 'LightSource',
     '37385': 'Flash',
     '37386': 'FocalLength',
     '41986': 'ExposureMode',
     '41987': 'WhiteBalance',
     '41991': 'GainControl',
     '41992': 'Contrast',
     '41993': 'Saturation',
     '41994': 'Sharpness',
    // These are special tags that we handle internally
     '34665': 'EXIFIFD',         // Offset of EXIF data
     '34853': 'GPSIFD',          // Offset of GPS data
    */
    '274' : 'ORIENTATION',
    '513': 'THUMBNAIL',         // Offset of thumbnail
    '514': 'THUMBNAILLENGTH'    // Length of thumbnail
  };

  function parseEntry(data, offset, byteorder, exif) {
    var tag = data.getUint16(offset, byteorder);
    var tagname = tagnames[tag];

    // If we don't know about this tag type or already processed it, skip it
    if (!tagname || exif[tagname]) {
      return;
    }

    var type = data.getUint16(offset + 2, byteorder);
    var count = data.getUint32(offset + 4, byteorder);

    var total = count * typesize[type];
    var valueOffset = total <= 4 ? offset + 8 :
      data.getUint32(offset + 8, byteorder);
    exif[tagname] = parseValue(data, valueOffset, type, count, byteorder);
  }

  function parseValue(data, offset, type, count, byteorder) {
    var i;
    if (type === 2) { // ASCII string
      var codes = [];
      for (i = 0; i < count - 1; i++) {
        codes[i] = data.getUint8(offset + i);
      }
      return String.fromCharCode.apply(String, codes);
    } else {
      if (count == 1) {
        return parseOneValue(data, offset, type, byteorder);
      } else {
        var values = [];
        var size = typesize[type];
        for (i = 0; i < count; i++) {
          values[i] = parseOneValue(data, offset + size * i, type, byteorder);
        }
        return values;
      }
    }
  }

  function parseOneValue(data, offset, type, byteorder) {
    switch (type) {
    case 1: // BYTE
    case 7: // UNDEFINED
      return data.getUint8(offset);
    case 2: // ASCII
      // This case is handed in parseValue
      return null;
    case 3: // SHORT
      return data.getUint16(offset, byteorder);
    case 4: // LONG
      return data.getUint32(offset, byteorder);
    case 5: // RATIONAL
      return data.getUint32(offset, byteorder) /
        data.getUint32(offset + 4, byteorder);
    case 6: // SBYTE
      return data.getInt8(offset);
    case 8: // SSHORT
      return data.getInt16(offset, byteorder);
    case 9: // SLONG
      return data.getInt32(offset, byteorder);
    case 10: // SRATIONAL
      return data.getInt32(offset, byteorder) /
        data.getInt32(offset + 4, byteorder);
    case 11: // FLOAT
      return data.getFloat32(offset, byteorder);
    case 12: // DOUBLE
      return data.getFloat64(offset, byteorder);
    }
    return null;
  }
}
;
define("jpegMetaDataParser", ["BlobView"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.parseJPEGMetadata;
    };
}(this)));

/* exported getImageSize */
/* global BlobView */
/* global parseJPEGMetadata */

/*
 * Determine the pixel dimensions of an image without actually
 * decoding the image. Passes an object of metadata to the callback
 * function on success or an error message to the error function on
 * failure. The metadata object will include type, width and height
 * properties. Supported image types are GIF, PNG and JPEG. JPEG
 * metadata may also include information about an EXIF preview image.
 *
 * Because of shortcomings in the way Gecko handles images, the
 * Gallery app will crash with an OOM error if it attempts to decode
 * and display an image that is too big. Images require 4 bytes per
 * pixel, so a 10 megapixel photograph requires 40 megabytes of image
 * memory. This function gives the gallery app a way to reject images
 * that are too large.
 *
 * Requires the BlobView class from shared/js/blobview.js and the
 * parseJPEGMetadata() function from shared/js/media/jpeg_metadata_parser.js
 */
function getImageSize(blob, callback, error) {
  

  BlobView.get(blob, 0, Math.min(1024, blob.size), function(data) {
    // Make sure we are at least 8 bytes long before reading the first 8 bytes
    if (data.byteLength <= 8) {
      error('corrupt image file');
      return;
    }
    var magic = data.getASCIIText(0, 8);
    if (magic.substring(0, 4) === 'GIF8') {
      try {
        callback({
          type: 'gif',
          width: data.getUint16(6, true),
          height: data.getUint16(8, true)
        });
      }
      catch (e) {
        error(e.toString());
      }
    }
    else if (magic.substring(0, 8) === '\x89PNG\r\n\x1A\n') {
      try {
        callback({
          type: 'png',
          width: data.getUint32(16, false),
          height: data.getUint32(20, false)
        });
      }
      catch (e) {
        error(e.toString());
      }
    }
    else if (magic.substring(0, 2) === 'BM' &&
             data.getUint32(2, true) === blob.size)
    {
      // This is a BMP file
      try {
        var width, height;

        if (data.getUint16(14, true) === 12) { // check format version
          width = data.getUint16(18, true);  // 16-bit little endian width
          height = data.getUint16(20, true); // 16-bit little endian height
        }
        else { // newer versions of the format use 32-bit ints
          width = data.getUint32(18, true);  // 32-bit little endian width
          height = data.getUint32(22, true); // 32-bit little endian height
        }

        callback({
          type: 'bmp',
          width: width,
          height: height
        });
      }
      catch (e) {
        error(e.toString());
      }
    }
    else if (magic.substring(0, 2) === '\xFF\xD8') {
      parseJPEGMetadata(blob,
                        function(metadata) {
                          if (metadata.progressive) {
                            // If the jpeg parser tells us that this is
                            // a progressive jpeg, then treat that as a
                            // distinct image type because pjpegs have
                            // such different memory requirements than
                            // regular jpegs.
                            delete metadata.progressive;
                            metadata.type = 'pjpeg';
                          }
                          else {
                            metadata.type = 'jpeg';
                          }
                          callback(metadata);
                        },
                        error);
    }
    else {
      error('unknown image type');
    }
  });
}
;
define("getImageSize", ["BlobView","jpegMetaDataParser"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.getImageSize;
    };
}(this)));

// downsample.js
//
// This module defines a single global Downsample object with static
// methods that return objects representing media fragments for
// downsampling images while they are decoded. The current implementation
// is based on the #-moz-samplesize media fragment. But because of
// problems with that fragment (see bug 1004908) it seems likely that a
// new syntax or new fragment will be introduced. If that happens, we can
// just change this module and not have to change anything else that
// depends on it.
//
// The method Downsample.areaAtLeast(scale) returns an object
// representing a media fragment to use to decode an image downsampled by
// at least as much as the specified scale.  If you are trying to preview
// an 8mp image and don't want to use more than 2mp of image memory, for
// example, you would pass a scale of .25 (2mp/8mp) here, and the
// resulting media fragment could be appended to the url to make the
// image decode at a size equal to or smaller than 2mp.
//
// The method Downsample.sizeNoMoreThan(scale) returns a media fragment
// object that you can use to reduce the dimensions of an image as much
// as possible without exceeding the specified scale. If you have a
// 1600x1200 image and want to decode it to produce an image that is as
// small as possible but at least 160x120, you would pass a scale of 0.1.
//
// The returned objects have a dimensionScale property that specifies how
// they affect the dimensions of the image and an areaScale property that
// specifies how much they affect the area (number of pixels) in an
// image. (The areaScale is just the square of the scale.) To avoid
// floating-point rounding issues, the values of these scale properties
// are rounded to the nearest hundredth.
//
// The returned objects also have a scale() method that scales a
// dimension with proper rounding (it rounds up to the nearest integer
// just as libjpeg does).
//
// Each object also has a toString() method that returns the required
// media fragment (including the hash mark) so you can simply use
// string concatentation to append one of these objects to the URL of
// the image you want to decode.
//
// Downsample.NONE is a no-op media fragment object with scale set to
// 1, and a toString() method that returns the empty string.
//
(function(exports) {
  

  // Round to the nearest hundredth to combat floating point rounding errors
  function round(x) {
    return Math.round(x * 100) / 100;
  }


  //
  // A factory method for returning an object that represents a
  // #-moz-samplesize media fragment. The use of Math.ceil() in the
  // scale method is from jpeg_core_output_dimensions() in
  // media/libjpeg/jdmaster.c and jdiv_round_up() in media/libjpeg/jutils.c
  //
  function MozSampleSize(n, scale) {
    return Object.freeze({
      dimensionScale: round(scale),
      areaScale: round(scale * scale),
      toString: function() { return '#-moz-samplesize=' + n; },
      scale: function(x) { return Math.ceil(x * scale); }
    });
  }

  // A fragment object that represents no downsampling with no fragment
  var NONE = Object.freeze({
    dimensionScale: 1,
    areaScale: 1,
    toString: function() { return ''; },
    scale: function(x) { return x; }
  });

  //
  // The five possible #-moz-samplesize values.
  // The mapping from sample size to scale comes from:
  // the moz-samplesize code in /image/decoders/nsJPEGDecoder.cpp and
  // the jpeg_core_output_dimensions() function in media/libjpeg/jdmaster.c
  //
  var fragments = [
    NONE,
    MozSampleSize(2, 1 / 2), // samplesize=2 reduces size by 1/2 and area by 1/4
    MozSampleSize(3, 3 / 8), // etc.
    MozSampleSize(4, 1 / 4),
    MozSampleSize(8, 1 / 8)
  ];

  // Return the fragment object that has the largest scale and downsamples the
  // dimensions of an image at least as much as the specified scale.
  // If none of the choices scales enough, return the one that comes closest
  function sizeAtLeast(scale) {
    scale = round(scale);
    for (var i = 0; i < fragments.length; i++) {
      var f = fragments[i];
      if (f.dimensionScale <= scale) {
        return f;
      }
    }
    return fragments[fragments.length - 1];
  }

  // Return the fragment object that downsamples an image as far as possible
  // without going beyond the specified scale. This might return NONE.
  function sizeNoMoreThan(scale) {
    scale = round(scale);
    for (var i = fragments.length - 1; i >= 0; i--) {
      var f = fragments[i];
      if (f.dimensionScale >= scale) {
        return f;
      }
    }
    return NONE;
  }

  // Return the fragment object that has the largest scale and downsamples the
  // area of an image at least as much as the specified scale.
  // If none of the choices scales enough, return the one that comes closest
  function areaAtLeast(scale) {
    scale = round(scale);
    for (var i = 0; i < fragments.length; i++) {
      var f = fragments[i];
      if (f.areaScale <= scale) {
        return f;
      }
    }
    return fragments[fragments.length - 1];
  }

  // Return the fragment object that downsamples the area of an image
  // as far as possible without going beyond the specified scale. This
  // might return NONE.
  function areaNoMoreThan(scale) {
    scale = round(scale);
    for (var i = fragments.length - 1; i >= 0; i--) {
      var f = fragments[i];
      if (f.areaScale >= scale) {
        return f;
      }
    }
    return NONE;
  }

  exports.Downsample = {
    sizeAtLeast: sizeAtLeast,
    sizeNoMoreThan: sizeNoMoreThan,
    areaAtLeast: areaAtLeast,
    areaNoMoreThan: areaNoMoreThan,
    NONE: NONE,
    MAX_SIZE_REDUCTION: 1 / fragments[fragments.length - 1].dimensionScale,
    MAX_AREA_REDUCTION: 1 / fragments[fragments.length - 1].areaScale
  };
}(window));

define("downsample", function(){});

/* exported cropResizeRotate */
/* global getImageSize */
/* global Downsample */

//
// Given a blob that represents an encoded image, decode the image, crop it,
// rotate it, resize it, encode it again and pass the encoded blob to the
// callback.
//
// If the image includes EXIF orientation information, it will be
// rotated and/or mirrored so that the proper side is up and EXIF
// orientation information will not be needed in the output blob. The
// blob will not include any EXIF data.
//
// The cropRegion argument is optional. If specfied, it should be an
// object with left, top, width and height properties that specify the
// region of interest in the image. These coordinates should be
// specified as if the image has already been rotated and mirrored. If
// this argument is not specified, then no cropping is done and the
// entire image is returned.
//
// The outputSize argument specifies the desired size of the output
// image.  If not specified, then the image is returned full-size. If
// this argument is specified, then it should be an object with width
// and height properties or a single number.  If outputSize is an
// object, then the returned image will have the specified size or
// smaller. If the aspect ratio of the output size does not match the
// aspect ratio of the original image or of the crop region, then the
// largest area of the input region that fits the output size without
// letterboxing will be used. If the output size is larger than the
// crop region, then the output size is reduced to match the crop
// region.
//
// If outputSize is a number, then the #-moz-samplesize media fragment
// will be used, if necessary, to ensure that the input image is
// decoded at the specified size or smaller. Note that this media
// fragment gives only coarse control over image size, so passing a
// number for this argument can result in the image being decoded at a
// size substantially smaller than the specified value. If outputSize
// is a number and a crop region is specified, the image will
// typically be downsampled and then cropped, further reducing the
// size of the resulting image. On the other hand, if the crop region
// is small enough, then the function may be able to use the #xywh=
// media fragment to extract just the desired region of the rectangle
// without downsampling. Whichever approach requires less image memory
// is used.
//
// The outputType argument specifies the type of the output image. Legal
// values are "image/jpeg" and "image/png". If not specified, and if the
// input image does not need to be cropped resized or rotated, then it
// will be returned unchanged regardless of the type. If no output type
// is specified and a new blob needs to be created then "image/jpeg" will
// be used. If a type is explicitly specified, and does not match the type
// of the input image, then a new blob will be created even if no other
// changes to the image are necessary.
//
// The optional metadata argument provides a way to pass in image size and
// rotation metadata if you already have it. If this argument is omitted
// or null, getImageSize() will be used to compute the metadata. But if you
// have already called getImageSize() on the blob, you can provide the
// metadata you have and avoid having to reparse the blob.
//
// The callback argument should be a function that expects two arguments.
// If the image is successfully processed, the first argument will be null
// and the second will be a blob.  If there was an error, the first argument
// will be an error message and the second argument will be undefined.
//
// If no cropRegion and no outputSize are specified, if the type of the
// input blob matches the requested outputType, and if the image does not
// require any rotation, then this function will not do any work and will
// simply pass the input blob to the callback.
//
// This function requires other shared JS files:
//
//    shared/js/blobview.js
//    shared/js/media/image_size.js
//    shared/js/media/jpeg_metadata_parser.js
//    shared/js/media/downsample.js
//
function cropResizeRotate(blob, cropRegion, outputSize, outputType,
                          metadata, callback)
{
  

  const JPEG = 'image/jpeg';
  const PNG = 'image/png';

  // The 2nd, 3rd, 4th and 5th arguments are optional, so fix things up if we're
  // called with fewer than 6 args. The last argument is always the callback.
  switch (arguments.length) {
  case 2:
    callback = cropRegion;
    cropRegion = outputSize = outputType = metadata = null;
    break;

  case 3:
    callback = outputSize;
    outputSize = outputType = metadata = null;
    break;

  case 4:
    callback = outputType;
    outputType = metadata = null;
    break;

  case 5:
    callback = metadata;
    metadata = null;
    break;

  case 6:
    // everything fine. do nothing here
    break;

  default:
    throw new Error('wrong number of arguments: ' + arguments.length);
  }

  if (cropRegion) { // make a private copy
    cropRegion = {
      left: cropRegion.left,
      top: cropRegion.top,
      width: cropRegion.width,
      height: cropRegion.height
    };
  }

  if (outputSize && typeof outputSize === 'object') { // make a private copy
    outputSize = {
      width: outputSize.width,
      height: outputSize.height
    };
  }
  // If we were passed a metadata object, pass it to gotSize. Otherwise,
  // find the metadata object first and then pass it.
  if (metadata) {
    gotSize(metadata);
  }
  else {
    getImageSize(blob, gotSize, function(msg) { callback(msg); });
  }

  function gotSize(metadata) {
    // This is the full size of the image in the input coordiate system
    var rawImageWidth = metadata.width;
    var rawImageHeight = metadata.height;
    var fullsize = rawImageWidth * rawImageHeight;
    var rotation = metadata.rotation || 0;
    var mirrored = metadata.mirrored || false;

    // Compute the full size of the image in the output coordinate system
    // I.e. if the image is sideways, swap the width and height
    var rotatedImageWidth, rotatedImageHeight;
    if (rotation === 0 || rotation === 180) {
      rotatedImageWidth = rawImageWidth;
      rotatedImageHeight = rawImageHeight;
    }
    else {
      rotatedImageWidth = rawImageHeight;
      rotatedImageHeight = rawImageWidth;
    }

    // If there is no crop region, use the full, rotated image.
    // If there is a crop region, make sure it fits inside the image.
    if (!cropRegion) {
      cropRegion = {
        left: 0,
        top: 0,
        width: rotatedImageWidth,
        height: rotatedImageHeight
      };
    }
    else {
      if (cropRegion.left < 0 || cropRegion.top < 0 ||
          (cropRegion.left + cropRegion.width > rotatedImageWidth) ||
          (cropRegion.top + cropRegion.height > rotatedImageHeight)) {
        callback('crop region does not fit inside image');
        return;
      }
    }

    // If there is no output size, use the size of the crop region.
    // If there is an output size make sure it is smaller than the crop region
    // and then adjust the crop region as needed so that the aspect ratios
    // match
    if (outputSize === null || outputSize === undefined) {
      outputSize = {
        width: cropRegion.width,
        height: cropRegion.height
      };
    }
    else if (typeof outputSize === 'number') {
      if (outputSize <= 0) {
        callback('outputSize must be positive');
        return;
      }

      if (fullsize < outputSize) {
        // If the full size of the image is less than the image decode size
        // limit, then we can decode the image at full size and use the full
        // crop region dimensions as the output size. Note that we can't just
        // compare the size of the crop region to the output size, because
        // even if we use the #xywh media fragment when decoding the image,
        // gecko still requires memory to decode the full image.
        outputSize = {
          width: cropRegion.width,
          height: cropRegion.height
        };
      }
      else {
        // In this case we need to specify an output size that is small
        // enough that we will be forced below to use #-moz-samplesize
        // to downsample the image while decoding it.
        // Note that we base this samplesize computation on the full size
        // of the image, because we can't use the #-moz-samplesize media
        // fragment along with the #xywh media fragment, so if we're using
        // samplesize we're going to have to decode the full image.
        var ds = Downsample.areaAtLeast(outputSize / fullsize);

        // Now that we've figured out how much the full image will be
        // downsampled, scale the crop region to match.
        outputSize = {
          width: ds.scale(cropRegion.width),
          height: ds.scale(cropRegion.height)
        };
      }
    }

    if (!(outputSize.width > 0 && outputSize.height > 0)) {
      callback('outputSize width and height must be positive');
      return;
    }

    // If the outputSize is bigger than the crop region, just adjust
    // the output size to match.
    if (outputSize.width > cropRegion.width) {
      outputSize.width = cropRegion.width;
    }
    if (outputSize.height > cropRegion.height) {
      outputSize.height = cropRegion.height;
    }

    // How much do we have to scale the crop region in X and Y dimensions
    // to match the output size?
    var scaleX = outputSize.width / cropRegion.width;
    var scaleY = outputSize.height / cropRegion.height;

    // We now adjust the crop region to match the output size. For
    // example if the outputSize is 200x200 and the cropRegion is
    // 600x400, then scaleX is .33 and scaleY is .5. In this case we can
    // leave the height of the crop region alone, but we need to reduce
    // the width of the crop region and adjust the left of the crop region

    if (scaleY > scaleX) {   // adjust width of crop region
      var oldCropWidth = cropRegion.width;
      cropRegion.width = Math.round(outputSize.width / scaleY);
      cropRegion.left += (oldCropWidth - cropRegion.width) >> 1;
    }
    else if (scaleX > scaleY) { // adjust height of crop region
      var oldCropHeight = cropRegion.height;
      cropRegion.height = Math.round(outputSize.height / scaleX);
      cropRegion.top += (oldCropHeight - cropRegion.height) >> 1;
    }

    // Make sure the outputType is valid, if one was specified
    if (outputType && outputType !== JPEG && outputType !== PNG) {
      callback('unsupported outputType: ' + outputType);
      return;
    }

    // Now that we've done these computations, we can pause for a moment
    // to see if there is actually any work that needs doing here. If not
    // we can just pass the input blob unchanged through to the callback
    if (rotation === 0 &&                      // No need to rotate
        !mirrored &&                           // or to mirror the image.
        (!outputType ||                        // Don't care about output type
         blob.type === outputType) &&          // or type is unchanged.
        outputSize.width === rawImageWidth &&  // Doesn't need crop or resize.
        outputSize.height == rawImageHeight) {
      callback(null, blob);
      return;
    }

    // The crop region we've been working with so far is in the output
    // coordinate system: it assumes that any required rotation has been done.
    // In order to know exactly which pixels to extract from the image we
    // need to convert to the unrotated, unmirrored input coordinate system.
    var inputCropRegion;

    // First, handle rotation
    switch (rotation) {
      case 180:
      // The image is upside down. The width and height are the same but
      // the top and left have to change.
      inputCropRegion = {
        left: rawImageWidth - cropRegion.left - cropRegion.width,
        top: rawImageHeight - cropRegion.top - cropRegion.height,
        width: cropRegion.width,
        height: cropRegion.height
      };
      break;

      case 90:
      // sideways: swap width and height and adjust top and left
      inputCropRegion = {
        left: cropRegion.top,
        top: rawImageHeight - cropRegion.left - cropRegion.width,
        width: cropRegion.height,
        height: cropRegion.width
      };
      break;

      case 270:
      // sideways: swap width and height and adjust top and left
      inputCropRegion = {
        left: rawImageWidth - cropRegion.top - cropRegion.height,
        top: cropRegion.left,
        width: cropRegion.height,
        height: cropRegion.width
      };
      break;

      default:
      // the crop region is the same in this case
      inputCropRegion = {
        left: cropRegion.left,
        top: cropRegion.top,
        width: cropRegion.width,
        height: cropRegion.height
      };
      break;
    }

    // Next, adjust for mirroring
    if (mirrored) {
      if (rotation === 90 || rotation === 270) {
        inputCropRegion.top =
          rawImageHeight - inputCropRegion.top - inputCropRegion.height;
      }
      else {
        inputCropRegion.left =
          rawImageWidth - inputCropRegion.left - inputCropRegion.width;
      }
    }

    // In order to decode the image, we create a blob:// URL for it
    var baseURL = URL.createObjectURL(blob);

    // Decoding an image takes a lot of memory and we want to minimize that.
    // Gecko allows us to use media fragments with our image URL to specify
    // that we do not want it to decode all of the pixels in the image. The
    // #-moz-samplesize= fragment allows us to specify that JPEG images
    // should be downsampled while being decoded, and this can save a lot of
    // memory. If we are not going to downsample the image, but are going to
    // crop it, then the #xywh= media fragment can help us do the cropping
    // more efficiently. If we use #xywh, Gecko still has to decode the image
    // at full size, so peak memory usage is not reduced. But Gecko can then
    // crop the image and free memory more quickly that it would otherwise.
    var croppedsize = cropRegion.width * cropRegion.height;
    var sampledsize;
    var downsample;

    // If we decode the image with a #-moz-samplesize media fragment, both
    // the x and y dimensions are reduced by the sample size, so the total
    // number of pixels is reduced by the square of the sample size.
    if (blob.type === JPEG) {
      // What media fragment can we use to downsample the crop region
      // so that it is as small as possible without being smaller than
      // the output size? We know that the output size and crop
      // region have the same aspect ratio now, so we only have to
      // consider one dimension. If we passed in a single number outputSize
      // up above then we Downsample.areaAtLeast() to compute the outputSize.
      // We should now get the same media fragment value here.
      downsample =
        Downsample.sizeNoMoreThan(outputSize.width / cropRegion.width);

      // And if apply that media fragment to the entire image, how big is
      // the result?
      sampledsize = downsample.scale(rawImageWidth) *
        downsample.scale(rawImageHeight);
    }
    else {
      downsample = Downsample.NONE;
      sampledsize = fullsize;
    }

    // Now add the appropriate media fragments to the url
    var url;
    var croppedWithMediaFragment = false, resizedWithMediaFragment = false;

    if (sampledsize < fullsize) {
      // Use a #-moz-samplesize media fragment to downsample while decoding
      url = baseURL + downsample;
      resizedWithMediaFragment = true;
    }
    else if (croppedsize < fullsize) {
      // Use a #xywh media fragment to crop while decoding.
      // This conveniently does the cropping for us, but doesn't actually
      // save any memory because gecko still decodes the image at fullsize
      // before cropping it internally. So we only use this media fragment
      // if we were not going to do any downsampling.
      url = baseURL + '#xywh=' +
        inputCropRegion.left + ',' +
        inputCropRegion.top + ',' +
        inputCropRegion.width + ',' +
        inputCropRegion.height;

      croppedWithMediaFragment = true;
    }
    else {
      // No media fragments in this case
      url = baseURL;
    }

    // Now we've done our calculations and we have an image URL to decode
    var offscreenImage = new Image();
    offscreenImage.src = url;
    offscreenImage.onerror = function() {
      callback('error decoding image: ' + url);
    };
    offscreenImage.onload = gotImage;

    // Called when the image has loaded
    function gotImage() {
      // If we used a media fragment on the image url, we can now
      // check whether the image we got has the expected size. And if it
      // does, we need to adjust the crop region to match the cropped or
      // resized image.
      if (croppedWithMediaFragment) {
        if (offscreenImage.width === inputCropRegion.width &&
            offscreenImage.height === inputCropRegion.height) {
          // We got the cropped size we asked for, so adjust the inputCropRegion
          // so that we don't crop again
          inputCropRegion.left = inputCropRegion.top = 0;
        }
      }
      else if (resizedWithMediaFragment) {
        if (offscreenImage.width < rawImageWidth ||
            offscreenImage.height < rawImageHeight) {
          // If we got an image that is smaller than full size, then the image
          // was downsampled while decoding, but it may still need cropping.
          // We reduce the crop region proportionally to the downsampling.
          var sampleSizeX = rawImageWidth / offscreenImage.width;
          var sampleSizeY = rawImageHeight / offscreenImage.height;
          inputCropRegion.left =
            Math.round(inputCropRegion.left / sampleSizeX);
          inputCropRegion.top =
            Math.round(inputCropRegion.top / sampleSizeY);
          inputCropRegion.width =
            Math.round(inputCropRegion.width / sampleSizeX);
          inputCropRegion.height =
            Math.round(inputCropRegion.height / sampleSizeY);
        }
      }

      // We've decoded the image now, so create a canvas we can copy it into
      var canvas = document.createElement('canvas');
      var destWidth = canvas.width = outputSize.width;
      var destHeight = canvas.height = outputSize.height;

      // Since we're only using the canvas as a way to encode the image
      // we set this willReadFrequently flag as a hint so that we avoid
      // copying the image data to and from the GPU since we don't do any
      // GPU operations on it
      var context = canvas.getContext('2d', { willReadFrequently: true });

      // If the image needs to be rotated or mirrored we have to establish
      // an appropriate transform on the context
      if (rotation || mirrored) {
        // translate so we're rotating around the center
        context.translate(canvas.width / 2, canvas.height / 2);

        if (mirrored) {
          context.scale(-1, 1);
        }

        // rotate
        switch (rotation) {
        case 90:
          context.rotate(Math.PI / 2);
          destWidth = canvas.height;
          destHeight = canvas.width;
          break;
        case 180:
          context.rotate(Math.PI);
          break;
        case 270:
          context.rotate(-Math.PI / 2);
          destWidth = canvas.height;
          destHeight = canvas.width;
          break;
        }

        // And translate back
        if (rotation === 90 || rotation === 270) {
          // For the 90 and 270 case we swap width and height
          context.translate(-canvas.height / 2, -canvas.width / 2);
        }
        else {
          context.translate(-canvas.width / 2, -canvas.height / 2);
        }
      }

      try {
        // Now we copy the image into the canvas.
        // The image has been loaded, but not decoded yet. If the image file
        // appears to be valid and has valid width and height metadata, then
        // the onload event handler will fire. But if the image is corrupt
        // or too big for gecko to decode with the amount of available
        // memory, then this drawImage() call can fail with an exception.
        context.drawImage(offscreenImage,
                          // What part of the image we're drawing
                          inputCropRegion.left, inputCropRegion.top,
                          inputCropRegion.width, inputCropRegion.height,
                          // And what part of the canvas we're drawing it to
                          0, 0, destWidth, destHeight);
      }
      catch(e) {
        callback('Failed to decode image in cropResizeRotate; ' +
                 'image may be corrupt or too large: ' + e);
        return;
      }
      finally {
        // Once the image has been copied, we can release the decoded image
        // memory and the blob URL.
        offscreenImage.src = '';
        URL.revokeObjectURL(baseURL);
      }

      // Finally, encode the image into a blob
      canvas.toBlob(gotEncodedBlob, outputType || JPEG);

      function gotEncodedBlob(blob) {
        // We have the encoded image but before we pass it to the callback
        // we need to free the canvas.
        canvas.width = canvas.height = 0;
        canvas = context = null;
        callback(null, blob);
      }
    }
  }
}
;
define("cropResizeRotate", ["BlobView","getImageSize","jpegMetaDataParser","downsample"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.cropResizeRotate;
    };
}(this)));

define('lib/resize-image-and-save',['require','exports','module','lib/storage','cropResizeRotate'],function(require, exports, module) {


var Storage = require('lib/storage');
var cropResizeRotate = require('cropResizeRotate');

/**
 * Exports
 */

module.exports = function(options, done) {
  var blob = options.blob;
  var outputSize = options.width && options.height ?
    {
      width: options.width,
      height: options.height
    } : options.size || null;

  cropResizeRotate(blob, null, outputSize, null, function(error, resizedBlob) {

    // If we couldn't resize or rotate it, use the original
    if (error) {
      console.error('Error while resizing image: ' + error);
      done(blob);
      return;
    }

    // We need to send a file-backed blob as the result of a pick activity
    // (see bug 975599) so we'll overwrite the old blob with the new one.
    // This means that the image stored will actually match the one passed
    // to the app that initiated the pick activity. We delete the old file,
    // then save the new blob with the same name. Then we read the file and
    // pass that to the callback.
    if (resizedBlob === blob) {
      done(blob);
      return;
    }

    var storage = new Storage();
    // We first delete the full resolution picture
    storage.deletePicture(blob.name, addPicture);
    // We save the scaled down image
    function addPicture(error) {
      if (error) {
        done(blob);
        return;
      }
      storage.addPicture(resizedBlob, {
        filepath: blob.name
      }, onSavedPicture);
    }

    function onSavedPicture(error, filepath, absolutePath, fileBlob) {
      done(fileBlob);
    }

  });
};

});

define('controllers/activity',['require','exports','module','debug','lib/bytes-to-pixels','lib/resize-image-and-save','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:activity');
var bytesToPixels = require('lib/bytes-to-pixels');
var resizeImageAndSave = require('lib/resize-image-and-save');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new ActivityController(app); };
module.exports.ActivityController = ActivityController;

/**
 * Initialize new `ActivityController`
 *
 * @param {App} app
 */
function ActivityController(app) {
  bindAll(this);
  this.app = app;
  this.win = app.win;
  this.settings = app.settings;
  this.configure();
  this.bindEvents();
  debug('initialized');
}

/**
 * Supported activity types.
 *
 * @type {Object}
 */
ActivityController.prototype.types = {
  pick: 'pick',
  record: 'record'
};

/**
 * Initial configuration.
 *
 * @private
 */
ActivityController.prototype.configure = function() {
  this.name = this.getName();
  this.app.activity[this.name] = true;
};

/**
 * Filter down pictureSizes and
 * recorderProfiles to match activity
 * parameters each time the settings
 * are configured.
 *
 * @private
 */
ActivityController.prototype.bindEvents = function() {
  this.app.on('activitycanceled', this.onActivityCanceled);
  this.app.on('confirm:selected', this.onActivityConfirmed);

  // If an activity name was found, we must bind
  // the listener straight away so we don't miss
  // the event, otherwise we can bind more lazily.
  if (this.name) { this.setupListener(); }
  else { this.app.once('criticalpathdone', this.setupListener); }
};

ActivityController.prototype.setupListener = function() {
  debug('setup listener');
  navigator.mozSetMessageHandler('activity', this.onMessage);
  debug('listener setup');
};

/**
 * Get activity name from the hash fragment.
 *
 * This is used only so that some parts
 * of the app can prepare for an incoming
 * activity before the message arrives.
 *
 * @private
 */
ActivityController.prototype.getName = function() {
  var hash = this.win.location.hash;
  var name = hash && hash.substr(1);
  return this.types[name];
};

/**
 * Responds to incoming activity message.
 *
 * Configures the mode then emits an
 * event so that other parts of
 * the app can update accordingly.
 *
 * @param  {MozActivity} activity
 */
ActivityController.prototype.onMessage = function(activity) {
  debug('incoming activity', activity);
  var name = activity.source.name;
  var supported = this.types[name];

  // Exit if this activity isn't supported
  if (!supported) { return; }

  var data = {
    name: name,
    maxPixelSize: this.getMaxPixelSize(activity),
    maxFileSizeBytes: activity.source.data.maxFileSizeBytes
  };

  this.activity = activity;
  this.configureMode(activity);
  this.app.emit('activity', data);
  this.app.emit('activity:' + name, data);
};

/**
 * Configures the mode setting based
 * on the parameters supplied by
 * the incoming activity.
 *
 * @param  {MozActivity} activity
 * @private
 */
ActivityController.prototype.configureMode = function(activity) {
  var type = activity.source.data.type;
  var name = activity.source.name;
  var modes = (name === 'pick') ?
    this.getModesForPick(type) :
    this.getModesForRecord(type);

  this.settings.mode.filterOptions(modes);
  this.settings.mode.select(modes[0]);
  debug('configured mode', modes);
};

/**
 * Get a max pixel size estimate based
 * on the parameters supplied by the
 * incoming activity.
 *
 * Activities don't always supply pixel
 * size restrictions.
 *
 * NOTE: There
 *
 * @param  {MozActivity} activity
 * @return {Number|null}
 */
ActivityController.prototype.getMaxPixelSize = function(activity) {
  var data = activity.source.data;
  var bytes = data.maxFileSizeBytes;
  var maxPickPixelSize = this.settings.activity.get('maxPickPixelSize') || 0;
  var maxPixelSize;

  // If bytes were specified then derive
  // a maxPixelSize from that, else we
  // calculate the maxPixelSize using
  // supplied dimensions.
  if (bytes) {
    maxPixelSize = bytesToPixels(bytes);
  } else if (data.width || data.height) {
    maxPixelSize = this.getMaxPixelsFromSize(data);
  } else {
    maxPixelSize = maxPickPixelSize;
  }

  // If the Camera app has been configured to have a max pixel size
  // for pick activities, ensure we are at or below that value.
  if (maxPickPixelSize > 0) {
    maxPixelSize = Math.min(maxPixelSize, maxPickPixelSize);
  }

  debug('maxPixelsSize: %s', maxPixelSize);
  return maxPixelSize;
};

ActivityController.prototype.getMaxPixelsFromSize = function(size) {
  var scale = this.settings.activity.get('maxPixelSizeScaleFactor');
  var aspect = 4 / 3;

  // In the event that only one dimension has
  // been supplied, calculate the largest the
  // other edge could be based on a 4:3 aspect.
  var width = size.width || size.height * aspect;
  var height = size.height || size.width * aspect;
  var pixels = width * height;

  // Take the actual total number of
  // pixels asked for and bump it by the
  // `scale` to cover pictureSizes above
  // the pixels asked for. We later resize
  // the image post-capture to the exact size
  // requested (data.width * data.height).
  //
  // This is to avoid us picking a pictureSize
  // smaller than the number of pixels requested
  // and then to scaling up post-capture,
  // resulting in a shitty image.
  return pixels * scale;
};

/**
 * Parse types given by 'pick' activity
 * and return a list of modes.
 *
 * @param  {Array|String} types
 * @return {Array}
 */
ActivityController.prototype.getModesForPick = function(types) {
  types = [].concat(types || []);
  var modes = [];

  types.forEach(function(item) {
    var type = item.split('/')[0];
    var mode = type === 'image' ? 'picture' : type;

    if (modes.indexOf(mode) === -1) {
      modes.push(mode);
    }
  });

  if (modes.length === 0) {
    modes = ['picture', 'video'];
  }

  return modes;
};

/**
 * Parse types given by 'record' activity
 * and return a list of modes.
 *
 * @param  {String} type
 * @return {Array}
 */
ActivityController.prototype.getModesForRecord = function(type) {
  return type === 'videos' ?
    ['video', 'picture'] :
    ['picture', 'video'];
};

/**
 * Respond to activity cancelation
 * events and send the error call
 * via the original acitity object.
 *
 * @private
 */
ActivityController.prototype.onActivityCanceled = function() {
  if (!this.activity) { return; }
  this.activity.postError('pick cancelled');
};

// TODO: Messy, tidy up!
ActivityController.prototype.onActivityConfirmed = function(newMedia) {
  var self = this;
  var activity = this.activity;
  var needsResizing;
  var media = {
    blob: newMedia.blob
  };

  // In low end devices resizing can be slow.
  // We display a spinner
  this.app.showSpinner();

  // Video
  if (newMedia.isVideo) {
    media.type = 'video/3gpp';
    media.poster = newMedia.poster.blob;
  }

  // Image
  else {
    media.type = 'image/jpeg';
    needsResizing = activity.source.data.width || activity.source.data.height;
    debug('needs resizing: %s', needsResizing);

    if (needsResizing) {
      resizeImageAndSave({
        blob: newMedia.blob,
        width: activity.source.data.width,
        height: activity.source.data.height
      }, onImageResized);
      return;
    }
  }

  function onImageResized(resizedBlob) {
    media.blob = resizedBlob;
    activity.postResult(media);
    self.app.clearSpinner();
  }

  activity.postResult(media);
  this.app.clearSpinner();

};

});

define('controllers/camera',['require','exports','module','debug','lib/bind-all'],function(require, exports, module) {


/**
 * Dependencies
 */

var debug = require('debug')('controller:camera');
var bindAll = require('lib/bind-all');

/**
 * Exports
 */

module.exports = function(app) { return new CameraController(app); };
module.exports.CameraController = CameraController;

/**
 * Initialize a new `CameraController`
 *
 * @param {App} app
 */
function CameraController(app) {
  bindAll(this);
  this.app = app;
  this.camera = app.camera;
  this.settings = app.settings;
  this.activity = app.activity;
  this.hdrDisabled = this.settings.hdr.get('disabled');
  this.notification = app.views.notification;
  this.l10nGet = app.l10nGet;
  this.configure();
  this.bindEvents();
  debug('initialized');
}

CameraController.prototype.bindEvents = function() {
  var settings = this.settings;
  var camera = this.camera;
  var app = this.app;

  // Relaying camera events means other modules
  // don't have to depend directly on camera
  camera.on('change:previewActive', this.app.firer('camera:previewactive'));
  camera.on('change:videoElapsed', app.firer('camera:recorderTimeUpdate'));
  camera.on('autofocuschanged', app.firer('camera:autofocuschanged'));
  camera.on('focusconfigured',  app.firer('camera:focusconfigured'));
  camera.on('change:focus', app.firer('camera:focusstatechanged'));
  camera.on('filesizelimitreached', this.onFileSizeLimitReached);
  camera.on('facesdetected', app.firer('camera:facesdetected'));
  camera.on('willrecord', app.firer('camera:willrecord'));
  camera.on('configured', app.firer('camera:configured'));
  camera.on('requesting', app.firer('camera:requesting'));
  camera.on('change:recording', app.setter('recording'));
  camera.on('newcamera', app.firer('camera:newcamera'));
  camera.on('newimage', app.firer('camera:newimage'));
  camera.on('newvideo', app.firer('camera:newvideo'));
  camera.on('shutter', app.firer('camera:shutter'));
  camera.on('loaded', app.firer('camera:loaded'));
  camera.on('closed', this.onCameraClosed);
  camera.on('error', app.firer('camera:error'));
  camera.on('ready', app.firer('ready'));
  camera.on('busy', app.firer('busy'));

  // App
  app.on('viewfinder:focuspointchanged', this.onFocusPointChanged);
  app.on('change:batteryStatus', this.onBatteryStatusChange);
  app.on('settings:configured', this.onSettingsConfigured);
  app.on('previewgallery:opened', this.shutdownCamera);
  app.on('previewgallery:closed', this.onGalleryClosed);
  app.on('stoprecording', this.camera.stopRecording);
  app.on('storage:volumechanged', this.onStorageVolumeChanged);
  app.on('storage:changed', this.onStorageChanged);
  app.on('activity:pick', this.onPickActivity);
  app.on('keydown:capture', this.onCaptureKey);
  app.on('keydown:focus', this.onFocusKey);
  app.on('timer:ended', this.capture);
  app.on('visible', this.camera.load);
  app.on('capture', this.capture);
  app.on('hidden', this.shutdownCamera);

  // Settings
  settings.recorderProfiles.on('change:selected', this.updateRecorderProfile);
  settings.pictureSizes.on('change:selected', this.updatePictureSize);
  settings.flashModes.on('change:selected', this.onFlashModeChange);
  settings.flashModes.on('change:selected', this.setFlashMode);
  settings.cameras.on('change:selected', this.setCamera);
  settings.mode.on('change:selected', this.setMode);
  settings.hdr.on('change:selected', this.setHDR);
  settings.hdr.on('change:selected', this.onHDRChange);

  debug('events bound');
};

/**
 * Take picture or start/end recording
 * when a capture hardware key is invoked.
 *
 * Calling `.preventDefault()` prevents
 * the default system operation
 * (eg. changing volume level). We
 * only call it when capture request
 * succeeds.
 *
 * We don't want to .preventDefault() when
 * the preview-gallery is open as the
 * user may want to change the volume
 * of a video being played back.
 *
 * @param  {Event} e
 * @private
 */
CameraController.prototype.onCaptureKey = function(e) {
  debug('on capture key', e);
  var output = this.capture();
  if (output !== false) { e.preventDefault(); }
};

/**
 * Focus the camera when a focus
 * hardware key is invoked.
 *
 * @param  {Event} e
 * @private
 */
CameraController.prototype.onFocusKey = function(e) {
  debug('on focus key', e);
  this.camera.focus.focus();
};

/**
 * Configure the 'cameras' setting using the
 * `cameraList` data given by the camera hardware
 *
 * @private
 */
CameraController.prototype.configure = function() {
  this.settings.cameras.filterOptions(this.camera.cameraList);
  debug('configured');
};

/**
 * Once the settings have finished configuring
 * we do the final camera configuration.
 *
 * @private
 */
CameraController.prototype.onSettingsConfigured = function() {
  var recorderProfile = this.settings.recorderProfiles.selected('key');
  var pictureSize = this.settings.pictureSizes.selected('data');

  this.setWhiteBalance();
  this.setFlashMode();
  this.setISO();
  this.setHDR();

  this.camera.setRecorderProfile(recorderProfile);
  this.camera.setPictureSize(pictureSize);
  this.camera.configureZoom();

  // Defer this work as it involves
  // expensive mozSettings calls
  // setTimeout(this.updateZoomForMako);

  debug('camera configured with final settings');
};

/**
 * Updates camera configuration in
 * response to pick activity parameters.
 *
 * @param  {Object} data
 * @private
 */
CameraController.prototype.onPickActivity = function(data) {

  // This is set so that the video recorder can
  // automatically stop when video size limit is reached.
  this.camera.set('maxFileSizeBytes', data.maxFileSizeBytes);

  // Disable camera config caches when in 'pick' activity
  // to prevent activity specific configuration persisting.
  this.camera.cacheConfig = false;
};

/**
 * Begins capture, first checking if
 * a countdown timer should be installed.
 *
 * @private
 */
CameraController.prototype.capture = function() {
  if (this.shouldCountdown()) {
    this.app.emit('startcountdown');
    return;
  }

  var position = this.app.geolocation.position;
  return this.camera.capture({ position: position });
};

/**
 * Fires a 'startcountdown' event if:
 * A timer settings is set, no timer is
 * already active, and the camera is
 * not currently recording.
 *
 * This event triggers the TimerController
 * to begin counting down, using the TimerView
 * to communicate the remaining seconds.
 *
 * @private
 */
CameraController.prototype.shouldCountdown = function() {
  var timerSet = this.settings.timer.selected('value');
  var timerActive = this.app.get('timerActive');
  var recording = this.app.get('recording');

  return timerSet && !timerActive && !recording;
};

CameraController.prototype.onFileSizeLimitReached = function() {
  this.camera.stopRecording();
  this.showSizeLimitAlert();
};

CameraController.prototype.showSizeLimitAlert = function() {
  if (this.sizeLimitAlertActive) { return; }
  this.sizeLimitAlertActive = true;
  var alertText = this.activity.pick ?
    'activity-size-limit-reached' :
    'storage-size-limit-reached';
  alert(this.l10nGet(alertText));
  this.sizeLimitAlertActive = false;
};

/**
 * Set the camera's mode (picture/video).
 *
 * We send a signal to say that the camera
 * 'will change', this allows other parts
 * of the app to respond if need be.
 *
 * We then wait for the viewfinder to be 'hidden'
 * before setting the camera to prevent the
 * user from seeing the stream flicker/jump.
 *
 * @param {String} mode ['picture'|'video']
 * @private
 */
CameraController.prototype.setMode = function(mode) {
  debug('set mode: %s', mode);
  var self = this;
  var html;

  // Abort if didn't change.
  //
  // TODO: Perhaps the `Setting` instance should
  // not emit a `change` event if the value did
  // not change? This may require some deep checking
  // if the value is an object. Quite a risky change
  // to make, but would remove the need for us to check
  // here and in other change callbacks. Food 4 thought :)
  if (this.camera.isMode(mode)) {
    debug('mode didn\'t change');
    return;
  }

  if (mode == 'video') {
    html = this.l10nGet('Video-Mode');
  }
  else {
    html = this.l10nGet('Photo-Mode');
  }
  this.notification.display({ text: html });

  this.setFlashMode();
  this.app.emit('camera:willchange');
  this.app.once('viewfinder:hidden', function() {
    self.camera.setMode(mode);
  });
};

/**
 * Updates the camera's `pictureSize` to match
 * the size set in the app's settings.
 *
 * When in 'picture' mode we send a signal
 * to say that the camera 'will change',
 * this allows other parts of the app to
 * repsond if need be.
 *
 * We then wait for the viewfinder to be hidden
 * before setting the pictureSize to prevent the
 * user from seeing the stream flicker/jump.
 *
 * @private
 */
CameraController.prototype.updatePictureSize = function() {
  debug('update picture-size');
  var pictureMode = this.settings.mode.selected('key') === 'picture';
  var value = this.settings.pictureSizes.selected('data');
  var self = this;

  // Don't do anything if the picture size didn't change
  if (this.camera.isPictureSize(value)) { return; }

  // If not currently in 'picture'
  // mode, just configure.
  if (!pictureMode) {
    this.camera.setPictureSize(value, { configure: false });
    return;
  }

  // Make change once the viewfinder is hidden
  this.app.emit('camera:willchange');
  this.app.once('viewfinder:hidden', function() {
    self.camera.setPictureSize(value);
  });
};

/**
 * Updates the camera's `recorderProfile` to
 * match the size set in the app's settings.
 *
 * When in 'picture' mode we send a signal
 * to say that the camera 'will change',
 * this allows other parts of the app to
 * repsond if need be.
 *
 * We then wait for the viewfinder to be hidden
 * before setting the pictureSize to prevent the
 * user from seeing the stream flicker/jump.
 *
 * @private
 */
CameraController.prototype.updateRecorderProfile = function() {
  debug('update recorder-profile');
  var videoMode = this.settings.mode.selected('key') === 'video';
  var key = this.settings.recorderProfiles.selected('key');
  var self = this;

  // Don't do anything if the recorder-profile didn't change
  if (this.camera.isRecorderProfile(key)) { return; }

  // If not currently in 'video'
  // mode, just configure.
  if (!videoMode) {
    this.camera.setRecorderProfile(key, { configure: false });
    return;
  }

  // Wait for the viewfinder to be hidden
  this.app.emit('camera:willchange');
  this.app.once('viewfinder:hidden', function() {
    self.camera.setRecorderProfile(key);
  });
};

/**
 * Set the selected camera (front/back).
 *
 * We send a signal to say that the camera
 * 'will change', this allows other parts
 * of the app to respond if need be.
 *
 * We then wait for the viewfinder to be 'hidden'
 * before setting the camera to prevent the
 * user from seeing the stream flicker/jump.
 *
 * @param {String} camera ['front'|'back']
 * @private
 */
CameraController.prototype.setCamera = function(camera) {
  debug('set camera: %s', camera);
  var self = this;
  this.app.emit('camera:willchange');
  this.app.once('viewfinder:hidden', function() {
    self.camera.setCamera(camera);
  });
};

/**
 * Sets the flash mode on the camera
 * to match the current flash mode
 * in the app's settings.
 *
 * @private
 */
CameraController.prototype.setFlashMode = function() {
  var flashSetting = this.settings.flashModes;
  this.camera.setFlashMode(flashSetting.selected('key'));
};

CameraController.prototype.setISO = function() {
  if (!this.settings.isoModes.get('disabled')) {
    this.camera.setISOMode(this.settings.isoModes.selected('key'));
  }
};

CameraController.prototype.setWhiteBalance = function() {
  if (!this.settings.whiteBalance.get('disabled')) {
    this.camera.setWhiteBalance(this.settings.whiteBalance.selected('key'));
  }
};

CameraController.prototype.setHDR = function() {
  if (this.hdrDisabled) { return; }
  this.camera.setHDR(this.settings.hdr.selected('key'));
};

CameraController.prototype.onFlashModeChange = function(flashModes) {
  if (this.hdrDisabled) { return; }
  var ishdrOn = this.settings.hdr.selected('key') === 'on';
  if (ishdrOn &&  flashModes !== 'off') {
    this.settings.hdr.select('off');
  }
};

CameraController.prototype.onHDRChange = function(hdr) {
  var flashMode = this.settings.flashModesPicture.selected('key');
  var ishdrOn = hdr === 'on';
  if (ishdrOn && flashMode !== 'off') {
    this.settings.flashModesPicture.select('off');
  }
};

CameraController.prototype.onBatteryStatusChange = function(status) {
  if (status === 'shutdown') { this.camera.stopRecording(); }
};

/**
 * Stop recording if storage changes state.
 * Examples:
 * 'shared' usually due to the device being connected to
 *  a computer via USB.
 * 'unavailable' when the SDCARD is yanked
 *
 * @private
 */
CameraController.prototype.onStorageChanged = function() {
  this.camera.stopRecording();
};

/**
 * For instance, when the storage volume changes from to internal memory
 * to the SD Card
 *
 * @private
 */
CameraController.prototype.onStorageVolumeChanged = function(storage) {
  this.camera.setVideoStorage(storage.video);
};

/**
 * Updates focus area when the user clicks on the viewfinder
 */
CameraController.prototype.onFocusPointChanged = function(focusPoint) {
  this.camera.updateFocusArea(focusPoint.area);
};

CameraController.prototype.shutdownCamera = function() {
  this.camera.shutdown();
};

/**
 * Camera hardware can be closed after a failure or after app request
 * It reboots the application in the case of failure
 *
 * @private
 */
CameraController.prototype.onCameraClosed = function(reason) {
  reason = reason || 'SystemFailure';
  if (reason === 'SystemFailure') {
    this.app.emit('reboot');
  }
};

/**
 * As the camera is shutdown when the
 * preview gallery is opened, we must
 * reload it when it is closed.
 *
 * Although if the app is has been minimised
 * we do not want to reload the camera as
 * the hardware must be released when the
 * app is not visible.
 *
 * @private
 */
CameraController.prototype.onGalleryClosed = function(reason) {
  if (this.app.hidden) { return; }
  this.app.showSpinner();
  this.camera.load(this.app.clearSpinner);
};

/**
 * For some reason, the above calculation
 * for `maxHardwareZoom` does not work
 * properly on Mako (Nexus-4) devices.
 *
 * Bug 983930 - [B2G][Camera] CameraControl API's
 * "zoom" attribute doesn't scale preview properly
 *
 * @private
 */
CameraController.prototype.updateZoomForMako = function() {
  // debug('update zoom for mako');

  // var self = this;
  // navigator.mozSettings
  //   .createLock()
  //   .get('deviceinfo.hardware')
  //   .onsuccess = onSuccess;

  // debug('settings request made');
  // function onSuccess(e) {
  //   var device = e.target.result['deviceinfo.hardware'];
  //   if (device !== 'mako') { return; }

  //   var frontCamera = self.camera.selectedCamera === 'front';
  //   var maxHardwareZoom = frontCamera ? 1 : 1.25;

  //   // Nexus 4 needs zoom preview adjustment since the viewfinder preview
  //   // stream does not automatically reflect the current zoom value.
  //   self.settings.zoom.set('useZoomPreviewAdjustment', true);
  //   self.camera.set('maxHardwareZoom', maxHardwareZoom);
  //   self.camera.emit('zoomconfigured', self.camera.getZoom());
  //   debug('zoom reconfigured for mako');
  // }
};

});



// Store timestamp when JS started running
window.jsStarted = Date.now();

define('main',['require','lib/settings','lib/geo-location','config/config','lib/camera/camera','app','controllers/overlay','controllers/battery','controllers/hud','controllers/controls','controllers/viewfinder','controllers/settings','controllers/activity','controllers/camera'],function(require) {

// Store performance timestamps
var perf = {
  jsStarted: window.jsStarted,
  firstModule: Date.now()
};

/**
 * Module Dependencies
 */

var Settings = require('lib/settings');
var GeoLocation = require('lib/geo-location');
var settingsData = require('config/config');
var settings = new Settings(settingsData);
var Camera = require('lib/camera/camera');
var App = require('app');

// Create globals specified in the config file
var key;
if (settingsData.globals) {
  for (key in settingsData.globals) {
    window[key] = settingsData.globals[key];
  }
}

// Create new `App`
var app = window.app = new App({
  settings: settings,
  geolocation: new GeoLocation(),
  el: document.body,
  doc: document,
  win: window,
  perf: perf,

  camera: new Camera({
    focus: settingsData.focus
  }),

  controllers: {
    overlay: require('controllers/overlay'),
    battery: require('controllers/battery'),
    hud: require('controllers/hud'),
    controls: require('controllers/controls'),
    viewfinder: require('controllers/viewfinder'),
    settings: require('controllers/settings'),
    activity: require('controllers/activity'),
    camera: require('controllers/camera'),

    // Lazy loaded controllers
    lazy: [
      'controllers/zoom-bar',
      'controllers/indicators',
      'controllers/recording-timer',
      'controllers/preview-gallery',
      'controllers/storage',
      'controllers/confirm',
      'controllers/sounds',
      'controllers/timer'
    ]
  }
});

// We start the camera loading straight
// away (async), as this is the slowest
// part of the boot process.
app.camera.load();
app.settings.fetch();
app.boot();

// Clean up
for (key in settingsData) {
  delete settingsData[key];
}

});

requirejs.config({
  baseUrl: '/js',

  // 'paths' lets us alias complex
  // paths to something simpler.
  paths: {
    'l10n': '../shared/js/l10n',
    'l10n_date': '../shared/js/l10n_date',
    'asyncStorage': '../shared/js/async_storage',
    'getVideoRotation': '../shared/js/media/get_video_rotation',
    'performance-testing-helper': '../shared/js/performance_testing_helper',
    'jpegMetaDataParser': '../shared/js/media/jpeg_metadata_parser',
    'downsample': '../shared/js/media/downsample',
    'getImageSize': '../shared/js/media/image_size',
    'cropResizeRotate': '../shared/js/media/crop_resize_rotate',
    'format': '../shared/js/format',
    'GestureDetector': '../shared/js/gesture_detector',
    'VideoPlayer': '../shared/js/media/video_player',
    'MediaFrame': '../shared/js/media/media_frame',
    'BlobView': '../shared/js/blobview',
    'CustomDialog': '../shared/js/custom_dialog',
    'debug': '../bower_components/debug/index',
    'attach': '../bower_components/attach/index',
    'model': '../bower_components/model/index',
    'view': '../bower_components/view/index',
    'evt': '../bower_components/evt/index',
    'drag': '../bower_components/drag/index',
    'device-orientation': '../bower_components/device-orientation/index',
    'stop-recording-event': '../shared/js/stop_recording_event'
  },

  // If your package uses relative `require()` paths
  // internally, then it needs to be defined as
  // a 'package' so they are resolved correctly.
  packages: [
    {
      name: 'gaia-header',
      location: '../bower_components/gaia-header',
      main: 'gaia-header'
    },
    {
      name: 'gaia-icons',
      location: '../bower_components/gaia-icons',
      main: 'gaia-icons'
    },
    {
      name: 'gaia-component',
      location: '../bower_components/gaia-component',
      main: 'gaia-component'
    }
  ],

  // 'shim' config lets us `require()` packages
  // that don't have an AMD define call.
  shim: {
    'format': {
      exports: 'Format'
    },
    'getVideoRotation': {
      deps: ['BlobView'],
      exports: 'getVideoRotation'
    },
    'MediaFrame': {
      deps: ['format', 'VideoPlayer', 'l10n_date'],
      exports: 'MediaFrame'
    },
    'BlobView': {
      exports: 'BlobView'
    },
    'asyncStorage': {
      exports: 'asyncStorage'
    },
    'performance-testing-helper': {
      exports: 'PerformanceTestingHelper'
    },
    'jpegMetaDataParser': {
      deps: ['BlobView'],
      exports: 'parseJPEGMetadata'
    },
    'getImageSize': {
      deps: ['BlobView', 'jpegMetaDataParser'],
      exports: 'getImageSize'
    },
    'cropResizeRotate': {
      deps: ['BlobView', 'getImageSize', 'jpegMetaDataParser', 'downsample'],
      exports: 'cropResizeRotate'
    },
    'GestureDetector': {
      exports: 'GestureDetector'
    },
    'CustomDialog': {
      exports: 'CustomDialog'
    },
    'stop-recording-event': {
      exports: 'StopRecordingEvent'
    }
  }
});

define("config/require", function(){});

require(["main"]);
