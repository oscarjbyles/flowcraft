// console shim to reduce noise; keeps warn/error, silences log/info/debug/trace
(function(){
    try {
        var c = window.console || {};
        var noop = function(){};
        c.log = noop;
        c.info = noop;
        c.debug = noop;
        c.trace = noop;
        // preserve warn/error
        if (!c.warn) c.warn = noop;
        if (!c.error) c.error = noop;
        window.console = c;
    } catch (_) {}
})();


