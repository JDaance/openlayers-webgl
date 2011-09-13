OpenLayers.Protocol.File = OpenLayers.Class(OpenLayers.Protocol.HTTP, {

    handleResponse: function(resp, options) {
        var request = resp.priv;
        if(options.callback) {
            if(request.status == 0) {
                // success
                if(resp.requestType != "delete") {
                    resp.features = this.parseFeatures(request);
                }
                resp.code = OpenLayers.Protocol.Response.SUCCESS;
            } else {
                // failure
                resp.code = OpenLayers.Protocol.Response.FAILURE;
            }
            options.callback.call(options.scope, resp);
        }
    },

    CLASS_NAME: "OpenLayers.Protocol.File"
});
