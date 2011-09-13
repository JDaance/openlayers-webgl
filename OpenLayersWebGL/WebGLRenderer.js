OpenLayers.Renderer.WebGL = OpenLayers.Class(OpenLayers.Renderer, {
    gl: null,

    shaderProgram: null,

    pMatrix: null,

    mvMatrix: null,

    vertexBuffer: null,

    featuresChanged: false,

    /**
     * Property: features
     * {Object} Internal object of feature/style pairs for use in redrawing the layer.
     */
    features: null,

    initialize: function(containerID) {
        OpenLayers.Renderer.prototype.initialize.apply(this, arguments);
        this.root = document.createElement("canvas");
        this.container.appendChild(this.root);
        this.features = {};

        this.mvMatrix = mat4.create();
        this.pMatrix = mat4.create();

        this.gl = this.initGL(this.root);
        this.initShaders();

        this.vertexBuffer = this.gl.createBuffer();

        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.enable(this.gl.DEPTH_TEST);
    },

    initGL: function(canvas) {
        var gl;
        try {
            gl = canvas.getContext("experimental-webgl");
        } catch(e) {
        }
        if (!gl) {
            alert("Could not initialise WebGL, sorry :-(");
        }
        return gl;
    },

    initShaders: function() {
        var fragmentShader = this.getShader("shader-fs");
        var vertexShader = this.getShader("shader-vs");

        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);

        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
            alert("Could not initialise shaders");
        }

        this.gl.useProgram(this.shaderProgram);

        this.shaderProgram.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
        this.gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);

        this.shaderProgram.pMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uPMatrix");
        this.shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
    },

    getShader: function(id) {
        var shaderScript = document.getElementById(id);
        if (!shaderScript) {
            return null;
        }

        var str = "";
        var k = shaderScript.firstChild;
        while (k) {
            if (k.nodeType == 3)
                str += k.textContent;
            k = k.nextSibling;
        }

        var shader;
        if (shaderScript.type == "x-shader/x-fragment") {
            shader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        } else if (shaderScript.type == "x-shader/x-vertex") {
            shader = this.gl.createShader(this.gl.VERTEX_SHADER);
        } else {
            return null;
        }

        this.gl.shaderSource(shader, str);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert(this.gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    },

    setMatrixUniforms: function() {
        this.gl.uniformMatrix4fv(this.shaderProgram.pMatrixUniform, false, this.pMatrix);
        this.gl.uniformMatrix4fv(this.shaderProgram.mvMatrixUniform, false, this.mvMatrix);
    },

    /**
     * Method: eraseGeometry
     * Erase a geometry from the renderer. Because the Canvas renderer has
     *     'memory' of the features that it has drawn, we have to remove the
     *     feature so it doesn't redraw.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * featureId - {String}
     */
    eraseGeometry: function(geometry, featureId) {
        this.eraseFeatures(this.features[featureId][0]);
    },

    /**
     * APIMethod: supported
     *
     * Returns:
     * {Boolean} Whether or not the browser supports the renderer class
     */
    supported: function() {
        return true;
    },

    /**
     * Method: setExtent
     * Set the visible part of the layer.
     *
     * Resolution has probably changed, so we nullify the resolution
     * cache (this.resolution), then redraw.
     *
     * Parameters:
     * extent - {<OpenLayers.Bounds>}
     */
    setExtent: function(extent) {
        this.extent = extent.clone();
        this.resolution = null;
        this.redraw();
    },

    /**
     * Method: setSize
     * Sets the size of the drawing surface.
     *
     * Once the size is updated, redraw the canvas.
     *
     * Parameters:
     * size - {<OpenLayers.Size>}
     */
    setSize: function(size) {
        this.size = size.clone();
        this.root.style.width = size.w + "px";
        this.root.style.height = size.h + "px";
        this.root.width = size.w;
        this.root.height = size.h;

        this.gl.viewportWidth = this.root.width;
        this.gl.viewportHeight = this.root.height;

        this.resolution = null;
    },

    /**
     * Method: drawFeature
     * Draw the feature. Stores the feature in the features list,
     * then redraws the layer.
     *
     * Parameters:
     * feature - {<OpenLayers.Feature.Vector>}
     * style - {<Object>}
     */
    drawFeature: function(feature, style) {
        style = style || feature.style;
        //style = this.applyDefaultSymbolizer(style);

        if (!this.features[feature.id])
            this.featuresChanged = true;

        this.features[feature.id] = [feature, style];

        return true;
    },


    /**
     * Method: drawGeometry
     * Used when looping (in redraw) over the features; draws
     * the canvas.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style - {Object}
     */
    drawGeometry: function(geometry, style) {
        var className = geometry.CLASS_NAME;
        if ((className == "OpenLayers.Geometry.Collection") ||
            (className == "OpenLayers.Geometry.MultiPoint") ||
            (className == "OpenLayers.Geometry.MultiLineString") ||
            (className == "OpenLayers.Geometry.MultiPolygon")) {
            for (var i = 0; i < geometry.components.length; i++) {
                this.drawGeometry(geometry.components[i], style);
            }
            return;
        }
        switch (geometry.CLASS_NAME) {
            case "OpenLayers.Geometry.Point":
                this.drawPoint(geometry, style);
                break;
            case "OpenLayers.Geometry.LineString":
                this.drawLineString(geometry, style);
                break;
            case "OpenLayers.Geometry.LinearRing":
                this.drawLinearRing(geometry, style);
                break;
            case "OpenLayers.Geometry.Polygon":
                this.drawPolygon(geometry, style);
                break;
            default:
                break;
        }
    },

    /**
     * Method: drawExternalGraphic
     * Called to draw External graphics.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style    - {Object}
     */
    drawExternalGraphic: function(pt, style) {
       var img = new Image();

       if(style.graphicTitle) {
           img.title=style.graphicTitle;
       }

       var width = style.graphicWidth || style.graphicHeight;
       var height = style.graphicHeight || style.graphicWidth;
       width = width ? width : style.pointRadius*2;
       height = height ? height : style.pointRadius*2;
       var xOffset = (style.graphicXOffset != undefined) ?
           style.graphicXOffset : -(0.5 * width);
       var yOffset = (style.graphicYOffset != undefined) ?
           style.graphicYOffset : -(0.5 * height);

       var context = { img: img,
                       x: (pt[0]+xOffset),
                       y: (pt[1]+yOffset),
                       width: width,
                       height: height,
                       opacity: style.graphicOpacity || style.fillOpacity,
                       canvas: this.canvas };

       img.onload = OpenLayers.Function.bind( function() {
           this.canvas.globalAlpha = this.opacity;
           this.canvas.drawImage(this.img, this.x,
                                 this.y, this.width, this.height);
       }, context);
       img.src = style.externalGraphic;
    },

    /**
     * Method: setCanvasStyle
     * Prepare the canvas for drawing by setting various global settings.
     *
     * Parameters:
     * type - {String} one of 'stroke', 'fill', or 'reset'
     * style - {Object} Symbolizer hash
     */
    setCanvasStyle: function(type, style) {
        if (type == "fill") {
            this.canvas.globalAlpha = style['fillOpacity'];
            this.canvas.fillStyle = style['fillColor'];
        } else if (type == "stroke") {
            this.canvas.globalAlpha = style['strokeOpacity'];
            this.canvas.strokeStyle = style['strokeColor'];
            this.canvas.lineWidth = style['strokeWidth'];
        } else {
            this.canvas.globalAlpha = 0;
            this.canvas.lineWidth = 1;
        }
    },

    /**
     * Method: drawPoint
     * This method is only called by the renderer itself.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style    - {Object}
     */
    drawPoint: function(geometry, style) {
        if(style.graphic !== false) {
            var pt = this.getLocalXY(geometry);

            if (style.externalGraphic) {
                this.drawExternalGraphic(pt, style);
            } else {
                if(style.fill !== false) {
                    this.setCanvasStyle("fill", style);
                    this.canvas.beginPath();
                    this.canvas.arc(pt[0], pt[1], style.pointRadius, 0, Math.PI*2, true);
                    this.canvas.fill();
                }

                if(style.stroke !== false) {
                    this.setCanvasStyle("stroke", style);
                    this.canvas.beginPath();
                    this.canvas.arc(pt[0], pt[1], style.pointRadius, 0, Math.PI*2, true);
                    this.canvas.stroke();
                    this.setCanvasStyle("reset");
                }
            }
        }
    },

    /**
     * Method: drawLineString
     * This method is only called by the renderer itself.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style    - {Object}
     */
    drawLineString: function(geometry, style) {
        /*if(style.stroke !== false) {
            this.setCanvasStyle("stroke", style);
            this.canvas.beginPath();
            var start = this.getLocalXY(geometry.components[0]);
            this.canvas.moveTo(start[0], start[1]);
            for(var i = 1; i < geometry.components.length; i++) {
                var pt = this.getLocalXY(geometry.components[i]);
                this.canvas.lineTo(pt[0], pt[1]);
            }
            this.canvas.stroke();
        }
        this.setCanvasStyle("reset");*/
    },

    /**
     * Method: drawLinearRing
     * This method is only called by the renderer itself.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style    - {Object}
     */
    drawLinearRing: function(geometry, style) {
        if(style.fill !== false) {
            this.setCanvasStyle("fill", style);
            this.canvas.beginPath();
            var start = this.getLocalXY(geometry.components[0]);
            this.canvas.moveTo(start[0], start[1]);
            for(var i = 1; i < geometry.components.length - 1 ; i++) {
                var pt = this.getLocalXY(geometry.components[i]);
                this.canvas.lineTo(pt[0], pt[1]);
            }
            this.canvas.fill();
        }

        if(style.stroke !== false) {
            this.setCanvasStyle("stroke", style);
            this.canvas.beginPath();
            var start = this.getLocalXY(geometry.components[0]);
            this.canvas.moveTo(start[0], start[1]);
            for(var i = 1; i < geometry.components.length; i++) {
                var pt = this.getLocalXY(geometry.components[i]);
                this.canvas.lineTo(pt[0], pt[1]);
            }
            this.canvas.stroke();
        }
        this.setCanvasStyle("reset");
    },

    /**
     * Method: drawPolygon
     * This method is only called by the renderer itself.
     *
     * Parameters:
     * geometry - {<OpenLayers.Geometry>}
     * style    - {Object}
     */
    drawPolygon: function(geometry, style) {
        this.drawLinearRing(geometry.components[0], style);
        for (var i = 1; i < geometry.components.length; i++) {
            this.drawLinearRing(geometry.components[i], {
                fillOpacity: 0,
                strokeWidth: 0,
                strokeOpacity: 0,
                strokeColor: '#000000',
                fillColor: '#000000'}
            ); // inner rings are 'empty'
        }
    },

    /**
     * Method: drawText
     * This method is only called by the renderer itself.
     *
     * Parameters:
     * location - {<OpenLayers.Point>}
     * style    - {Object}
     */
    drawText: function(location, style) {
        style = OpenLayers.Util.extend({
            fontColor: "#000000",
            labelAlign: "cm"
        }, style);
        var pt = this.getLocalXY(location);

        this.setCanvasStyle("reset");
        this.canvas.fillStyle = style.fontColor;
        this.canvas.globalAlpha = style.fontOpacity || 1.0;
        var fontStyle = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
        if (this.canvas.fillText) {
            // HTML5
            var labelAlign =
                OpenLayers.Renderer.Canvas.LABEL_ALIGN[style.labelAlign[0]] ||
                "center";
            this.canvas.font = fontStyle;
            this.canvas.textAlign = labelAlign;
            this.canvas.fillText(style.label, pt[0], pt[1]);
        } else if (this.canvas.mozDrawText) {
            // Mozilla pre-Gecko1.9.1 (<FF3.1)
            this.canvas.mozTextStyle = fontStyle;
            // No built-in text alignment, so we measure and adjust the position
            var len = this.canvas.mozMeasureText(style.label);
            switch(style.labelAlign[0]) {
                case "l":
                    break;
                case "r":
                    pt[0] -= len;
                    break;
                case "c":
                default:
                    pt[0] -= len / 2;
            }
            this.canvas.translate(pt[0], pt[1]);

            this.canvas.mozDrawText(style.label);
            this.canvas.translate(-1*pt[0], -1*pt[1]);
        }
        this.setCanvasStyle("reset");
    },

    /**
     * Method: getLocalXY
     * transform geographic xy into pixel xy
     *
     * Parameters:
     * point - {<OpenLayers.Geometry.Point>}
     */
    getLocalXY: function(point) {
        var resolution = this.getResolution();
        var extent = this.extent;
        var x = (point.x / resolution + (-extent.left / resolution));
        var y = ((extent.top / resolution) - point.y / resolution);
        return [x, y];
    },

    /**
     * Method: clear
     * Clear all vectors from the renderer.
     */
    clear: function() {
        //this.canvas.clearRect(0, 0, this.root.width, this.root.height);
        this.features = {};
    },

    /**
     * Method: getFeatureIdFromEvent
     * Returns a feature id from an event on the renderer.
     *
     * Parameters:
     * evt - {<OpenLayers.Event>}
     *
     * Returns:
     * {String} A feature id or null.
     */
    getFeatureIdFromEvent: function(evt) {
        var loc = this.map.getLonLatFromPixel(evt.xy);
        var resolution = this.getResolution();
        var bounds = new OpenLayers.Bounds(loc.lon - resolution * 5,
                                           loc.lat - resolution * 5,
                                           loc.lon + resolution * 5,
                                           loc.lat + resolution * 5);
        var geom = bounds.toGeometry();
        for (var feat in this.features) {
            if (!this.features.hasOwnProperty(feat)) { continue; }
            if (this.features[feat][0].geometry.intersects(geom)) {
                return feat;
            }
        }
        return null;
    },

    /**
     * Method: eraseFeatures
     * This is called by the layer to erase features; removes the feature from
     *     the list, then redraws the layer.
     *
     * Parameters:
     * features - {Array(<OpenLayers.Feature.Vector>)}
     */
    eraseFeatures: function(features) {
        if(!(features instanceof Array)) {
            features = [features];
        }
        for(var i=0; i<features.length; ++i) {
            delete this.features[features[i].id];
        }
        this.redraw();
    },

    redraw: function() {
        this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        mat4.ortho(0, this.gl.viewportWidth, this.gl.viewportHeight, 0, -1, 1, this.pMatrix)

        mat4.identity(this.mvMatrix);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, 3, this.gl.FLOAT, false, 0, 0);
        this.setMatrixUniforms();

        if (this.featuresChanged)
            this.bufferFeatures();

        for (var featureKey in this.features) {
            var feature = this.features[featureKey][0];
            var geometry = feature.geometry;

            if (geometry) {
                this.gl.drawArrays(this.gl.LINE_STRIP, feature.bufferOffset * 3, feature.vertexCount);
            }
        }
    },

    bufferFeatures: function() {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, 40000, this.gl.DYNAMIC_DRAW);
        var totalVertexCount = 0;

        var arrayBuffer = new ArrayBuffer(2000 * 4);
        var bigbuffer = new Float32Array(40000);

        for (var featureKey in this.features) {
            var feature = this.features[featureKey][0];
            var geometry = feature.geometry;

            //var float32Buffer = new Float32Array(arrayBuffer, 0, geometry.components.length * 3);

            if (geometry) {
                var featureVertexCount = 0;

                for(var i = 0; i < geometry.components.length; i++) {
                    var pt = this.getLocalXY(geometry.components[i]);
                    bigbuffer[3*(totalVertexCount + i)] = pt[0];
                    bigbuffer[3*(i + totalVertexCount) + 1] = pt[1];
                    bigbuffer[3*(i + totalVertexCount) + 2] = 0.0;
                    featureVertexCount += 1;
                }

                feature.bufferOffset = totalVertexCount;
                feature.vertexCount = featureVertexCount;

                totalVertexCount += featureVertexCount;
            }
        }

        this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, bigbuffer);

        this.featuresChanged = false;
    },

    CLASS_NAME: "OpenLayers.Renderer.WebGL"
});

/**
 * Constant: OpenLayers.Renderer.Canvas.LABEL_ALIGN
 * {Object}
 */
OpenLayers.Renderer.WebGL.LABEL_ALIGN = {
    "l": "left",
    "r": "right"
};
