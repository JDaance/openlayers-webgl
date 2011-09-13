OpenLayers.Layer.WebGLVector = OpenLayers.Class(OpenLayers.Layer, {

    EVENT_TYPES: [],

    isBaseLayer: false,

    isFixed: false,

    isVector: true,

    features: null,

    filter: null,

    selectedFeatures: null,

    unrenderedFeatures: null,

    strategies: null,

    protocol: null,

    renderer: null,

    /**
     * Property: drawn
     * {Boolean} Whether the Vector Layer features have been drawn yet.
     */
    drawn: false,

    /**
     * Constructor: OpenLayers.Layer.Vector
     * Create a new vector layer
     *
     * Parameters:
     * name - {String} A name for the layer
     * options - {Object} Optional object with non-default properties to set on
     *           the layer.
     *
     * Returns:
     * {<OpenLayers.Layer.Vector>} A new vector layer
     */
    initialize: function(name, options) {

        // concatenate events specific to vector with those from the base
        this.EVENT_TYPES =
            OpenLayers.Layer.Vector.prototype.EVENT_TYPES.concat(
            OpenLayers.Layer.prototype.EVENT_TYPES
        );

        OpenLayers.Layer.prototype.initialize.apply(this, arguments);

        // allow user-set renderer, otherwise assign one
        if (!this.renderer || !this.renderer.supported()) {
            this.assignRenderer();
        }

        // if no valid renderer found, display error
        if (!this.renderer || !this.renderer.supported()) {
            this.renderer = null;
            this.displayError();
        }

        if (!this.styleMap) {
            this.styleMap = new OpenLayers.StyleMap();
        }

        this.features = [];
        this.selectedFeatures = [];
        this.unrenderedFeatures = {};

        // Allow for custom layer behavior
        if(this.strategies){
            for(var i=0, len=this.strategies.length; i<len; i++) {
                this.strategies[i].setLayer(this);
            }
        }

    },

    /**
     * APIMethod: destroy
     * Destroy this layer
     */
    destroy: function() {
        if (this.strategies) {
            var strategy, i, len;
            for(i=0, len=this.strategies.length; i<len; i++) {
                strategy = this.strategies[i];
                if(strategy.autoDestroy) {
                    strategy.destroy();
                }
            }
            this.strategies = null;
        }
        if (this.protocol) {
            if(this.protocol.autoDestroy) {
                this.protocol.destroy();
            }
            this.protocol = null;
        }
        this.destroyFeatures();
        this.features = null;
        this.selectedFeatures = null;
        this.unrenderedFeatures = null;
        if (this.renderer) {
            this.renderer.destroy();
        }
        this.renderer = null;
        this.geometryType = null;
        this.drawn = null;
        OpenLayers.Layer.prototype.destroy.apply(this, arguments);
    },

    /**
     * Method: clone
     * Create a clone of this layer.
     *
     * Note: Features of the layer are also cloned.
     *
     * Returns:
     * {<OpenLayers.Layer.Vector>} An exact clone of this layer
     */
    clone: function (obj) {

        if (obj == null) {
            obj = new OpenLayers.Layer.Vector(this.name, this.getOptions());
        }

        //get all additions from superclasses
        obj = OpenLayers.Layer.prototype.clone.apply(this, [obj]);

        // copy/set any non-init, non-simple values here
        var features = this.features;
        var len = features.length;
        var clonedFeatures = new Array(len);
        for(var i=0; i<len; ++i) {
            clonedFeatures[i] = features[i].clone();
        }
        obj.features = clonedFeatures;

        return obj;
    },

    /**
     * Method: refresh
     * Ask the layer to request features again and redraw them.  Triggers
     *     the refresh event if the layer is in range and visible.
     *
     * Parameters:
     * obj - {Object} Optional object with properties for any listener of
     *     the refresh event.
     */
    refresh: function(obj) {
        if(this.calculateInRange() && this.visibility) {
            this.events.triggerEvent("refresh", obj);
        }
    },

    /**
     * Method: assignRenderer
     * Iterates through the available renderer implementations and selects
     * and assigns the first one whose "supported()" function returns true.
     */
    assignRenderer: function()  {
        for (var i=0, len=this.renderers.length; i<len; i++) {
            var rendererClass = this.renderers[i];
            var renderer = (typeof rendererClass == "function") ?
                rendererClass :
                OpenLayers.Renderer[rendererClass];
            if (renderer && renderer.prototype.supported()) {
                this.renderer = new renderer(this.div, this.rendererOptions);
                break;
            }
        }
    },

    /**
     * Method: displayError
     * Let the user know their browser isn't supported.
     */
    displayError: function() {
        if (this.reportError) {
            OpenLayers.Console.userError(OpenLayers.i18n("browserNotSupported",
                                     {'renderers':this.renderers.join("\n")}));
        }
    },

    /**
     * Method: setMap
     * The layer has been added to the map.
     *
     * If there is no renderer set, the layer can't be used. Remove it.
     * Otherwise, give the renderer a reference to the map and set its size.
     *
     * Parameters:
     * map - {<OpenLayers.Map>}
     */
    setMap: function(map) {
        OpenLayers.Layer.prototype.setMap.apply(this, arguments);

        if (!this.renderer) {
            this.map.removeLayer(this);
        } else {
            this.renderer.map = this.map;
            this.renderer.setSize(this.map.getSize());
        }
    },

    /**
     * Method: afterAdd
     * Called at the end of the map.addLayer sequence.  At this point, the map
     *     will have a base layer.  Any autoActivate strategies will be
     *     activated here.
     */
    afterAdd: function() {
        if(this.strategies) {
            var strategy, i, len;
            for(i=0, len=this.strategies.length; i<len; i++) {
                strategy = this.strategies[i];
                if(strategy.autoActivate) {
                    strategy.activate();
                }
            }
        }
    },

    /**
     * Method: removeMap
     * The layer has been removed from the map.
     *
     * Parameters:
     * map - {<OpenLayers.Map>}
     */
    removeMap: function(map) {
        this.drawn = false;
        if(this.strategies) {
            var strategy, i, len;
            for(i=0, len=this.strategies.length; i<len; i++) {
                strategy = this.strategies[i];
                if(strategy.autoActivate) {
                    strategy.deactivate();
                }
            }
        }
    },

    /**
     * Method: onMapResize
     * Notify the renderer of the change in size.
     *
     */
    onMapResize: function() {
        OpenLayers.Layer.prototype.onMapResize.apply(this, arguments);
        this.renderer.setSize(this.map.getSize());
    },

    /**
     * Method: moveTo
     *  Reset the vector layer's div so that it once again is lined up with
     *   the map. Notify the renderer of the change of extent, and in the
     *   case of a change of zoom level (resolution), have the
     *   renderer redraw features.
     *
     *  If the layer has not yet been drawn, cycle through the layer's
     *   features and draw each one.
     *
     * Parameters:
     * bounds - {<OpenLayers.Bounds>}
     * zoomChanged - {Boolean}
     * dragging - {Boolean}
     */
    moveTo: function(bounds, zoomChanged, dragging) {
        OpenLayers.Layer.prototype.moveTo.apply(this, arguments);

        var coordSysUnchanged = true;

        if (!dragging) {
            this.renderer.root.style.visibility = "hidden";

            this.div.style.left = -parseInt(this.map.layerContainerDiv.style.left) + "px";
            this.div.style.top = -parseInt(this.map.layerContainerDiv.style.top) + "px";
            var extent = this.map.getExtent();
            coordSysUnchanged = this.renderer.setExtent(extent, zoomChanged);

            this.renderer.root.style.visibility = "visible";

            // Force a reflow on gecko based browsers to prevent jump/flicker.
            // This seems to happen on only certain configurations; it was originally
            // noticed in FF 2.0 and Linux.
            if (navigator.userAgent.toLowerCase().indexOf("gecko") != -1) {
                this.div.scrollLeft = this.div.scrollLeft;
            }

            if(!zoomChanged && coordSysUnchanged) {
                for(var i in this.unrenderedFeatures) {
                    var feature = this.unrenderedFeatures[i];
                    this.drawFeature(feature);
                }
            }
        }

        if (!this.drawn || zoomChanged || !coordSysUnchanged) {
            this.drawn = true;
            var feature;
            for(var i=0, len=this.features.length; i<len; i++) {
                this.renderer.locked = (i !== (len - 1));
                feature = this.features[i];
                this.drawFeature(feature);
            }
        }
    },

    /**
     * APIMethod: display
     * Hide or show the Layer
     *
     * Parameters:
     * display - {Boolean}
     */
    display: function(display) {
        OpenLayers.Layer.prototype.display.apply(this, arguments);
        // we need to set the display style of the root in case it is attached
        // to a foreign layer
        var currentDisplay = this.div.style.display;
        if(currentDisplay != this.renderer.root.style.display) {
            this.renderer.root.style.display = currentDisplay;
        }
    },

    /**
     * APIMethod: addFeatures
     * Add Features to the layer.
     *
     * Parameters:
     * features - {Array(<OpenLayers.Feature.Vector>)}
     * options - {Object}
     */
    addFeatures: function(features, options) {
        if (!(features instanceof Array)) {
            features = [features];
        }

        var notify = !options || !options.silent;
        if(notify) {
            var event = {features: features};
            var ret = this.events.triggerEvent("beforefeaturesadded", event);
            if(ret === false) {
                return;
            }
            features = event.features;
        }

        // Track successfully added features for featuresadded event, since
        // beforefeatureadded can veto single features.
        var featuresAdded = [];
        for (var i=0, len=features.length; i<len; i++) {
            if (i != (features.length - 1)) {
                this.renderer.locked = true;
            } else {
                this.renderer.locked = false;
            }
            var feature = features[i];

            if (this.geometryType &&
              !(feature.geometry instanceof this.geometryType)) {
                var throwStr = OpenLayers.i18n('componentShouldBe',
                          {'geomType':this.geometryType.prototype.CLASS_NAME});
                throw throwStr;
              }

            //give feature reference to its layer
            feature.layer = this;

            if (!feature.style && this.style) {
                feature.style = OpenLayers.Util.extend({}, this.style);
            }

            if (notify) {
                if(this.events.triggerEvent("beforefeatureadded",
                                            {feature: feature}) === false) {
                    continue;
                };
                this.preFeatureInsert(feature);
            }

            featuresAdded.push(feature);
            this.features.push(feature);
            this.drawFeature(feature);

            if (notify) {
                this.events.triggerEvent("featureadded", {
                    feature: feature
                });
                this.onFeatureInsert(feature);
            }
        }

        if(notify) {
            this.events.triggerEvent("featuresadded", {features: featuresAdded});
        }
    },


    /**
     * APIMethod: removeFeatures
     * Remove features from the layer.  This erases any drawn features and
     *     removes them from the layer's control.  The beforefeatureremoved
     *     and featureremoved events will be triggered for each feature.  The
     *     featuresremoved event will be triggered after all features have
     *     been removed.  To supress event triggering, use the silent option.
     *
     * Parameters:
     * features - {Array(<OpenLayers.Feature.Vector>)} List of features to be
     *     removed.
     * options - {Object} Optional properties for changing behavior of the
     *     removal.
     *
     * Valid options:
     * silent - {Boolean} Supress event triggering.  Default is false.
     */
    removeFeatures: function(features, options) {
        if(!features || features.length === 0) {
            return;
        }
        if (features === this.features) {
            return this.removeAllFeatures(options);
        }
        if (!(features instanceof Array)) {
            features = [features];
        }
        if (features === this.selectedFeatures) {
            features = features.slice();
        }

        var notify = !options || !options.silent;

        if (notify) {
            this.events.triggerEvent(
                "beforefeaturesremoved", {features: features}
            );
        }

        for (var i = features.length - 1; i >= 0; i--) {
            // We remain locked so long as we're not at 0
            // and the 'next' feature has a geometry. We do the geometry check
            // because if all the features after the current one are 'null', we
            // won't call eraseGeometry, so we break the 'renderer functions
            // will always be called with locked=false *last*' rule. The end result
            // is a possible gratiutious unlocking to save a loop through the rest
            // of the list checking the remaining features every time. So long as
            // null geoms are rare, this is probably okay.
            if (i != 0 && features[i-1].geometry) {
                this.renderer.locked = true;
            } else {
                this.renderer.locked = false;
            }

            var feature = features[i];
            delete this.unrenderedFeatures[feature.id];

            if (notify) {
                this.events.triggerEvent("beforefeatureremoved", {
                    feature: feature
                });
            }

            this.features = OpenLayers.Util.removeItem(this.features, feature);
            // feature has no layer at this point
            feature.layer = null;

            if (feature.geometry) {
                this.renderer.eraseFeatures(feature);
            }

            //in the case that this feature is one of the selected features,
            // remove it from that array as well.
            if (OpenLayers.Util.indexOf(this.selectedFeatures, feature) != -1){
                OpenLayers.Util.removeItem(this.selectedFeatures, feature);
            }

            if (notify) {
                this.events.triggerEvent("featureremoved", {
                    feature: feature
                });
            }
        }

        if (notify) {
            this.events.triggerEvent("featuresremoved", {features: features});
        }
    },

    /**
     * APIMethod: removeAllFeatures
     * Remove all features from the layer.
     *
     * Parameters:
     * options - {Object} Optional properties for changing behavior of the
     *     removal.
     *
     * Valid options:
     * silent - {Boolean} Supress event triggering.  Default is false.
     */
    removeAllFeatures: function(options) {
        var notify = !options || !options.silent;
        var features = this.features;
        if (notify) {
            this.events.triggerEvent(
                "beforefeaturesremoved", {features: features}
            );
        }
        var feature;
        for (var i = features.length-1; i >= 0; i--) {
            feature = features[i];
            if (notify) {
                this.events.triggerEvent("beforefeatureremoved", {
                    feature: feature
                });
            }
            feature.layer = null;
            if (notify) {
                this.events.triggerEvent("featureremoved", {
                    feature: feature
                });
            }
        }
        this.renderer.clear();
        this.features = [];
        this.unrenderedFeatures = {};
        this.selectedFeatures = [];
        if (notify) {
            this.events.triggerEvent("featuresremoved", {features: features});
        }
    },

    /**
     * APIMethod: destroyFeatures
     * Erase and destroy features on the layer.
     *
     * Parameters:
     * features - {Array(<OpenLayers.Feature.Vector>)} An optional array of
     *     features to destroy.  If not supplied, all features on the layer
     *     will be destroyed.
     * options - {Object}
     */
    destroyFeatures: function(features, options) {
        var all = (features == undefined); // evaluates to true if
                                           // features is null
        if(all) {
            features = this.features;
        }
        if(features) {
            this.removeFeatures(features, options);
            for(var i=features.length-1; i>=0; i--) {
                features[i].destroy();
            }
        }
    },

    /**
     * APIMethod: drawFeature
     * Draw (or redraw) a feature on the layer.  If the optional style argument
     * is included, this style will be used.  If no style is included, the
     * feature's style will be used.  If the feature doesn't have a style,
     * the layer's style will be used.
     *
     * This function is not designed to be used when adding features to
     * the layer (use addFeatures instead). It is meant to be used when
     * the style of a feature has changed, or in some other way needs to
     * visually updated *after* it has already been added to a layer. You
     * must add the feature to the layer for most layer-related events to
     * happen.
     *
     * Parameters:
     * feature - {<OpenLayers.Feature.Vector>}
     * style - {String | Object} Named render intent or full symbolizer object.
     */
    drawFeature: function(feature, style) {
        // don't try to draw the feature with the renderer if the layer is not
        // drawn itself
        if (!this.drawn) {
            return
        }
        /*if (typeof style != "object") {
            if(!style && feature.state === OpenLayers.State.DELETE) {
                style = "delete";
            }
            var renderIntent = style || feature.renderIntent;
            style = feature.style || this.style;
            if (!style) {
                style = this.styleMap.createSymbolizer(feature, renderIntent);
            }
        }         */

        if (!this.renderer.drawFeature(feature, style)) {
            this.unrenderedFeatures[feature.id] = feature;
        } else {
            delete this.unrenderedFeatures[feature.id];
        };
    },

    /**
     * Method: eraseFeatures
     * Erase features from the layer.
     *
     * Parameters:
     * features - {Array(<OpenLayers.Feature.Vector>)}
     */
    eraseFeatures: function(features) {
        this.renderer.eraseFeatures(features);
    },

    /**
     * Method: getFeatureFromEvent
     * Given an event, return a feature if the event occurred over one.
     * Otherwise, return null.
     *
     * Parameters:
     * evt - {Event}
     *
     * Returns:
     * {<OpenLayers.Feature.Vector>} A feature if one was under the event.
     */
    getFeatureFromEvent: function(evt) {
        if (!this.renderer) {
            OpenLayers.Console.error(OpenLayers.i18n("getFeatureError"));
            return null;
        }
        var featureId = this.renderer.getFeatureIdFromEvent(evt);
        return this.getFeatureById(featureId);
    },

    /**
     * APIMethod: getFeatureBy
     * Given a property value, return the feature if it exists in the features array
     *
     * Parameters:
     * property - {String}
     * value - {String}
     *
     * Returns:
     * {<OpenLayers.Feature.Vector>} A feature corresponding to the given
     * property value or null if there is no such feature.
     */
    getFeatureBy: function(property, value) {
        //TBD - would it be more efficient to use a hash for this.features?
        var feature = null;
        for(var i=0, len=this.features.length; i<len; ++i) {
            if(this.features[i][property] == value) {
                feature = this.features[i];
                break;
            }
        }
        return feature;
    },

    /**
     * APIMethod: getFeatureById
     * Given a feature id, return the feature if it exists in the features array
     *
     * Parameters:
     * featureId - {String}
     *
     * Returns:
     * {<OpenLayers.Feature.Vector>} A feature corresponding to the given
     * featureId or null if there is no such feature.
     */
    getFeatureById: function(featureId) {
        return this.getFeatureBy('id', featureId);
    },

    /**
     * APIMethod: getFeatureByFid
     * Given a feature fid, return the feature if it exists in the features array
     *
     * Parameters:
     * featureFid - {String}
     *
     * Returns:
     * {<OpenLayers.Feature.Vector>} A feature corresponding to the given
     * featureFid or null if there is no such feature.
     */
    getFeatureByFid: function(featureFid) {
        return this.getFeatureBy('fid', featureFid);
    },

    /**
     * Unselect the selected features
     * i.e. clears the featureSelection array
     * change the style back
    clearSelection: function() {

       var vectorLayer = this.map.vectorLayer;
        for (var i = 0; i < this.map.featureSelection.length; i++) {
            var featureSelection = this.map.featureSelection[i];
            vectorLayer.drawFeature(featureSelection, vectorLayer.style);
        }
        this.map.featureSelection = [];
    },
     */


    /**
     * APIMethod: onFeatureInsert
     * method called after a feature is inserted.
     * Does nothing by default. Override this if you
     * need to do something on feature updates.
     *
     * Paarameters:
     * feature - {<OpenLayers.Feature.Vector>}
     */
    onFeatureInsert: function(feature) {
    },

    /**
     * APIMethod: preFeatureInsert
     * method called before a feature is inserted.
     * Does nothing by default. Override this if you
     * need to do something when features are first added to the
     * layer, but before they are drawn, such as adjust the style.
     *
     * Parameters:
     * feature - {<OpenLayers.Feature.Vector>}
     */
    preFeatureInsert: function(feature) {
    },

    /**
     * APIMethod: getDataExtent
     * Calculates the max extent which includes all of the features.
     *
     * Returns:
     * {<OpenLayers.Bounds>}
     */
    getDataExtent: function () {
        var maxExtent = null;
        var features = this.features;
        if(features && (features.length > 0)) {
            maxExtent = new OpenLayers.Bounds();
            var geometry = null;
            for(var i=0, len=features.length; i<len; i++) {
                geometry = features[i].geometry;
                if (geometry) {
                    maxExtent.extend(geometry.getBounds());
                }
            }
        }
        return maxExtent;
    },

    CLASS_NAME: "OpenLayers.Layer.Vector"
});
