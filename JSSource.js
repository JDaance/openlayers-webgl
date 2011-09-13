OpenLayers.Protocol.JSSource = OpenLayers.Class(OpenLayers.Protocol, {

    objectName: null,

    initialize: function(options) {
        options = options || {};
        OpenLayers.Protocol.prototype.initialize.apply(this, arguments);
    },

    read: function(options) {
        OpenLayers.Protocol.prototype.read.apply(this, arguments);

        var resp = new OpenLayers.Protocol.Response({requestType: "read"});
        resp.features = this.parseFeatures(window[this.objectName]);

        if(options.callback) {
            options.callback.call(options.scope, resp);
        }
    },

    parseFeatures: function(object) {
        return this.format.read(object);
    },

    CLASS_NAME: "OpenLayers.Protocol.JSSource"
});
