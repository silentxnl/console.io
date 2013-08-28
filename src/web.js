/**
 * Web
 *
 * User: nisheeth
 * Date: 27/08/13
 * Time: 14:57
 */

(function (exports, global) {

    var web = exports.web = {};

    function Controller(config) {
        this.store = {
            added: [],
            queue: []
        };

        this.config = exports.util.extend({
            docked: false,
            position: 'bottom',
            height: '300px',
            width: '99%'
        }, config);

        this.control = {
            pageSize: 50,
            filters: [],
            paused: false,
            search: null
        };

        this.view = new View(this);

        exports.transport.on('device:pluginConfig', this.syncConfig, this);
        exports.transport.on('device:pluginControl', this.syncControl, this);
        exports.transport.emit('plugin', { name: 'WebIO', enabled: true });
    }

    Controller.prototype.render = function render(target) {
        this.view.render(target);
    };

    Controller.prototype.destroy = function destroy() {
        exports.transport.emit('plugin', { name: 'WebIO', enabled: false });
        this.view.destroy();
    };

    Controller.prototype.syncControl = function syncControl(data) {
        if (data.clear) {
            this.view.clear();
        } else {
            if (typeof data.paused !== 'undefined') {
                this.control.paused = data.paused;
            }

            if (typeof data.filters !== 'undefined') {
                this.control.filters = data.filters;
            }

            if (data.pageSize !== this.control.pageSize) {
                this.control.pageSize = data.pageSize;
            }

            if (data.search !== this.control.search) {
                this.applySearch(data.search);
            }

            this.view.clear();
            this.view.addBatch(this.getData(this.store.added));
            this.addBatch();
        }
    };

    Controller.prototype.syncConfig = function syncConfig(data) {
        this.config = exports.util.extend(this.config, data);
        this.view.reload();
    };

    Controller.prototype.getData = function getData(store) {
        var count = 0, dataStore = [];
        if (store.length > 0) {
            exports.util.every([].concat(store).reverse(), function (item) {
                if (this.isFiltered(item) && this.isSearchFiltered(item)) {
                    dataStore.push(item);
                    count++;
                }

                return this.control.pageSize > count;
            }, this);
        }

        return dataStore;
    };

    Controller.prototype.add = function add(data) {
        if (!this.control.paused) {
            this.store.added.push(data);
            this.view.add(data);
        } else {
            this.store.queue.push(data);
        }
    };

    Controller.prototype.addBatch = function addBatch() {
        if (!this.control.paused) {
            this.view.addBatch(this.getData(this.store.queue));
            this.store.added = this.store.added.concat(this.store.queue);
            this.store.queue = [];
        }
    };

    Controller.prototype.applySearch = function applySearch(value) {
        this.control.search = typeof value !== 'undefined' ? value : null;
        if (this.control.search) {
            if (this.control.search[0] !== "\\") {
                this.control.search = new RegExp("\\b" + this.control.search, "img");
            } else {
                this.control.search = new RegExp(this.control.search, "img");
            }
        }
    };

    Controller.prototype.isSearchFiltered = function isSearchFiltered(data) {
        return this.control.search ? data.message.search(this.control.search) > -1 : true;
    };

    Controller.prototype.isFiltered = function isFiltered(data) {
        return this.control.filters.length === 0 || (this.control.filters.length > 0 && this.control.filters.indexOf(data.type) > -1);
    };


    function View(ctrl) {
        this.ctrl = ctrl;
        this.elements = {};
        this.target = null;
        this.container = null;
    }

    View.prototype.render = function render(target) {
        this.target = target;
        this.createContainer();
    };

    View.prototype.reload = function reload() {
        this.clear();
        this.container.parentNode.removeChild(this.container);
        this.createContainer();
    };

    View.prototype.destroy = function destroy() {
        this.clear();
        this.container.parentNode.removeChild(this.container);
    };

    View.prototype.createContainer = function createContainer() {
        var styles = [
            'background-color: rgba(219, 255, 232, 0.3)',
            'overflow: auto',
            'margin: 5px',
            '-o-box-shadow: 0 0 5px 1px #888',
            '-moz-box-shadow: 0 0 5px 1px #888',
            '-webkit-box-shadow: 0 0 5px 1px #888',
            'box-shadow: 0 0 5px 1px #888'
        ];

        if (!this.ctrl.config.docked) {
            styles.push('position:absolute');
        }

        if (this.ctrl.config.height) {
            styles.push('height:' + this.ctrl.config.height);
        }

        if (this.ctrl.config.width) {
            styles.push('width:' + this.ctrl.config.width);
        }

        switch (this.ctrl.config.position.toLowerCase()) {
            case 'top':
                styles.push('top: 5px');
                break;
            default:
                styles.push('bottom: 5px');
                break;
        }

        this.container = this.createElement({
            attr: {
                id: 'console-log',
                'style': styles.join(';'),
                tabindex: 1
            },
            target: this.target,
            position: this.ctrl.config.position
        });
    };

    View.prototype.createElement = function createElement(config) {
        config.tag = config.tag || 'div';
        if (!this.elements[config.tag]) {
            this.elements[config.tag] = document.createElement(config.tag);
        }

        var element = this.elements[config.tag].cloneNode(false);
        exports.util.forEachProperty(config.attr, function (value, property) {
            if (value) {
                element.setAttribute(property, value);
            }
        });

        exports.util.forEachProperty(config.prop, function (value, property) {
            if (value) {
                element[property] = value;
            }
        });

        if (config.target) {
            if (config.position && config.position === 'top') {
                config.target.insertBefore(element, config.target.firstElementChild || config.target.firstChild);
            } else {
                config.target.appendChild(element);
            }
        }

        return element;
    };

    View.prototype.stripBrackets = function stripBrackets(data) {
        var last = data.length - 1;
        if (data.charAt(0) === '[' && data.charAt(last) === ']') {
            return data.substring(1, last);
        }
        return data;
    };

    View.prototype.getElementData = function getElementData(data) {
        var tag = 'code',
            css = data.type,
            stackMessage,
            message = this.stripBrackets(data.message);

        // check if asset failed
        if (data.type === "assert") {
            var asset = this.stripBrackets(message).split(",");
            if (asset[0].toLowerCase() !== "true") {
                css = "assert-failed";
            }
        }

        // for Opera and Maple browser
        message = message.replace(/%20/img, " ");

        // switch to pre mode if message contain object
        if (message.indexOf("{") > -1 && message.indexOf("}") > -1) {
            tag = 'pre';
        }

        if (data.stack) {
            var stack = data.stack.split(",")
                .join("\n")
                .replace(/"/img, '')
                .replace(/%20/img, ' ');

            stackMessage = this.stripBrackets(stack);
            message += '\n' + stackMessage;
        }

        if (['assert', 'dir', 'dirxml', 'error', 'trace'].indexOf(data.type) > -1) {
            tag = 'pre';
        }

        return {
            tag: tag,
            className: 'console type-' + css,
            message: (message || '.')
        };
    };

    View.prototype.add = function add(data) {
        if (!this.ctrl.isFiltered(data) || !this.ctrl.isSearchFiltered(data)) {
            return false;
        }

        var element = this.getElementData(data);

        this.createElement({
            tag: element.tag,
            attr: {
                'class': element.className
            },
            prop: {
                innerHTML: element.message
            },
            target: this.container,
            position: 'top'
        });

        this.removeOverflowElement();
    };

    View.prototype.addBatch = function addBatch(store) {
        if (store.length > 0) {
            var fragment = document.createDocumentFragment();

            exports.util.forEach(store, function (item) {
                var element = this.getElementData(item);
                this.createElement({
                    tag: element.tag,
                    attr: {
                        'class': element.className
                    },
                    prop: {
                        innerHTML: element.message
                    },
                    target: fragment,
                    position: 'bottom'
                });
            }, this);

            this.container.insertBefore(fragment, this.container.firstElementChild || this.container.firstChild);
            this.removeOverflowElement();
        }
    };

    View.prototype.clear = function clear() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    };

    View.prototype.removeOverflowElement = function removeOverflowElement() {
        var length = this.container.childElementCount || this.container.children.length;
        while (length > this.ctrl.control.pageSize) {
            this.container.removeChild(this.container.lastElementChild || this.container.lastChild);
            length--;
        }
    };

    function log(data) {
        web.logger.add(data);
    }

    web.Controller = Controller;
    web.View = View;
    web.setUp = function setUp(config){
        web.logger = new Controller(config);
        web.logger.render(document.body);

        var webConfig = {};
        if (typeof config.filters !== 'undefined') {
            webConfig.filters = typeof config.filters === 'string' ? config.filters.split(',') : config.filters;
        }

        if (typeof config.pageSize !== 'undefined') {
            webConfig.pageSize = config.pageSize;
        }

        if (typeof config.search !== 'undefined') {
            webConfig.search = config.search;
        }

        web.logger.syncControl(webConfig);

        exports.console.on('console', log);
    };

    web.disabled = function disabled(){
        exports.console.removeListener('console', log);
        web.logger.destroy();
    };

}('undefined' !== typeof ConsoleIO ? ConsoleIO : module.exports, this));