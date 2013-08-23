Wolf.setConsts({
    FOV_RAD             : 75 * Math.PI / 180,
    ISCHROME            : /chrome/.test(navigator.userAgent.toLowerCase()),
    ISSAFARI            : /safari/.test(navigator.userAgent.toLowerCase()),
    ISFIREFOX           : /firefox/.test(navigator.userAgent.toLowerCase()),
    ISXP                : /windows nt 5\./.test(navigator.userAgent.toLowerCase()),
    ISWEBKIT            : /webkit/.test(navigator.userAgent.toLowerCase())
});
Wolf.setConsts({
    VIEW_DIST           : (Wolf.XRES / 2) / Math.tan((Wolf.FOV_RAD / 2)),
    TEXTURERESOLUTION   : Wolf.ISCHROME ? 128 : 64
});

Wolf.Renderer = (function() {

    var slices = [],
        useBackgroundImage = Wolf.ISWEBKIT,
        texturePath = "art/walls-shaded/" + Wolf.TEXTURERESOLUTION + "/",
        spritePath = "art/sprites/" + Wolf.TEXTURERESOLUTION + "/",
        maxDistZ = 64 * 0x10000,
        hasInit = false;

    var TILESHIFT = Wolf.TILESHIFT,
        TILEGLOBAL = Wolf.TILEGLOBAL,
        TRACE_HIT_VERT = Wolf.TRACE_HIT_VERT,
        TRACE_HIT_DOOR = Wolf.TRACE_HIT_DOOR,
        WALL_TILE = Wolf.WALL_TILE,
        DOOR_TILE = Wolf.DOOR_TILE,
        TEX_PLATE = Wolf.TEX_PLATE,
        TILE2POS = Wolf.TILE2POS,
        POS2TILE = Wolf.POS2TILE,
        VIEW_DIST = Wolf.VIEW_DIST,
        SLICE_WIDTH = Wolf.SLICE_WIDTH,
        WALL_TEXTURE_WIDTH = Wolf.WALL_TEXTURE_WIDTH,
        FINE2RAD = Wolf.FINE2RAD,
        XRES = Wolf.XRES,
        YRES = Wolf.YRES,
        MINDIST = Wolf.MINDIST,
        cos = Math.cos,
        sin = Math.sin,
        tan = Math.tan,
        atan2 = Math.atan2,
        round = Math.round,
        sqrt = Math.sqrt;

  function processTrace(viewport, tracePoint) {
    var x = tracePoint.x,
    y = tracePoint.y,
    vx = viewport.x,
    vy = viewport.y,

    dx = viewport.x - tracePoint.x,
    dy = viewport.y - tracePoint.y,
    dist = Math.sqrt(dx*dx + dy*dy),
    frac,
    h, w, offset;

    // correct for fisheye
    dist = dist * cos(FINE2RAD(tracePoint.angle - viewport.angle));

    w = WALL_TEXTURE_WIDTH * SLICE_WIDTH;
    h = (VIEW_DIST / dist * TILEGLOBAL) >> 0;

    if (tracePoint.flags & TRACE_HIT_DOOR) {
      if (tracePoint.flags & TRACE_HIT_VERT) {
        if (x < vx) {
          frac = tracePoint.frac;
        } else {
          frac = 1 - tracePoint.frac;
        }
      } else {
        if (y < vy) {
          frac = 1 - tracePoint.frac;
        } else {
          frac = tracePoint.frac;
        }
      }
    } else {
      frac = 1 - tracePoint.frac;
    }

    offset = frac * w;
    if (offset > w - SLICE_WIDTH) {
      offset = w - SLICE_WIDTH;
    }
    offset = round(offset / SLICE_WIDTH) * SLICE_WIDTH;
    if (offset < 0) {
      offset = 0;
    }

    return {
      w : w,
      h : h,
      dist : dist,
      vert : tracePoint.flags & TRACE_HIT_VERT,
      offset : offset
    };
  }

  var DivOrImage = React.createClass({
    render: function() {
      if (useBackgroundImage) {
        return this.transferPropsTo(React.DOM.div({style: {backgroundImage: 'url(' + this.props.src + ')'}}));
      } else {
        return this.transferPropsTo(React.DOM.img());
      }
    }
  });

  var Slice = React.createClass({
    render: function() {
      var top = (Wolf.YRES - this.props.proc.h) / 2;
      var left = -(this.props.proc.offset) >> 0;
      var height = this.props.proc.h;
      var z = (maxDistZ - this.props.proc.dist) >> 0;
      var itop;
      var textureSrc = this.props.textureSrc;

      if (Wolf.ISXP && Wolf.ISFIREFOX) {
        itop = (this.props.proc.texture % 2) ? 0 : -height;
      } else {
        itop = -(this.props.proc.texture-1) * height;
        textureSrc = "art/walls-shaded/64/walls.png";
      }

      var imageStyle = {
        position: 'absolute',
        display: 'block',
        left: left,
        top: itop,
        height: Wolf.ISXP && Wolf.ISFIREFOX ? (height * 2) : height * 120,
        width: Wolf.SLICE_WIDTH * Wolf.WALL_TEXTURE_WIDTH,
        backgroundSize: '100% 100%'
      };
      return React.DOM.div({
        style: {
          position: 'absolute',
          width: Wolf.SLICE_WIDTH,
          height: height,
          left: this.props.x,
          top: top,
          overflow: 'hidden',
          zIndex: z
        }
      }, DivOrImage({style: imageStyle, src: textureSrc}));
    }
  });

  var Sprite = React.createClass({
    getDefaultProps: function() {
      return {size: 128, imageWidth: '100%', imageHeight: '100%'};
    },
    render: function() {
      var imageStyle = {
        position: 'absolute',
        display: 'block',
        top: 0,
        left: this.props.imageLeft,
        height: this.props.imageHeight,
        width: this.props.imageWidth,
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat'
      };

      var divStyle = {
        display: 'block',
        position: 'absolute',
        width: this.props.size,
        height: this.props.size,
        overflow: 'hidden',
        left: this.props.left,
        top: this.props.top,
        zIndex: this.props.zIndex
      };

      return React.DOM.div({
        style: divStyle,
        className: 'sprite'
      }, DivOrImage({style: imageStyle, src: this.props.src}));
    }
  });

  var Renderer = React.createClass({
    getInitialState: function() {
      return {
        viewport: null,
        level: null,
        tracers: null,
        visibleTiles: null
      };
    },
    reset: function() {
      this.setState(this.getInitialState());
    },
    drawDoor: function(viewport, tracePoint, level) {
      var proc = processTrace(viewport, tracePoint),
      texture, textureSrc;

      texture = level.state.doorMap[tracePoint.tileX][tracePoint.tileY].texture + 1;

      proc.texture = texture;

      if (texture % 2 == 0) {
        texture -= 1;
      }

      textureSrc = texturePath + "w_" + texture + ".png";

      return {textureSrc: textureSrc, proc: proc};
    },
    drawWall: function(viewport, tracePoint, level) {
      var x = tracePoint.tileX,
      y = tracePoint.tileY,
      vx = POS2TILE(viewport.x),
      vy = POS2TILE(viewport.y),
      tileMap = level.tileMap,
      proc = processTrace(viewport, tracePoint),
      texture = proc.vert ? level.wallTexX[x][y] : level.wallTexY[x][y],
      textureSrc;


      // door sides
      if (tracePoint.flags & TRACE_HIT_VERT) {
        if (x >= vx && tileMap[x-1][y] & DOOR_TILE) {
          texture = TEX_PLATE;
        }
        if (x < vx && tileMap[x+1][y] & DOOR_TILE) {
          texture = TEX_PLATE;
        }
      } else {
        if (y >= vy && tileMap[x][y-1] & DOOR_TILE) {
          texture = TEX_PLATE;
        }
        if (y < vy && tileMap[x][y+1] & DOOR_TILE) {
          texture = TEX_PLATE;
        }
      }

      texture++;

      proc.texture = texture;

      if (texture % 2 == 0) {
        texture--;
      }
      textureSrc = texturePath + "w_" + texture + ".png";
      return {textureSrc: textureSrc, proc: proc};
    },
    drawSprites: function(viewport, level, visibleTiles) {
      var visibleSprites = Wolf.Sprites.createVisList(viewport, level, visibleTiles);
      var spriteComponents = [];

      for (var n = 0; n < visibleSprites.length; ++n) {
        var vis = visibleSprites[n];
        var dist = vis.dist;
        var dx = vis.sprite.x - viewport.x;
        var dy = vis.sprite.y - viewport.y;
        var angle = atan2(dy, dx) - FINE2RAD(viewport.angle);
        var size = (VIEW_DIST / dist * TILEGLOBAL) >> 0;
        var left = (XRES / 2 - size / 2 - tan(angle) * VIEW_DIST);
        var top = (YRES / 2 - size / 2);
        var texture = Wolf.Sprites.getTexture(vis.sprite.tex[0]);
        var textureSrc = spritePath + texture.sheet;
        var z = (maxDistZ - dist) >> 0;
        var imageWidth = texture.num * size;
        var imageLeft = -texture.idx * size;

        // TODO: can we use a better key here?
        spriteComponents.push(Sprite({
          key: 'sprite' + n,
          left: left,
          top: top,
          zIndex: z,
          src: textureSrc,
          imageWidth: imageWidth,
          imageHeight: size,
          size: size,
          imageLeft: imageLeft
        }));
      }
      return spriteComponents;
    },
    _draw: function(viewport, level, tracers, visibleTiles) {
      var n, tracePoint;
      var sliceProps = {};

      for (var n=0,len=tracers.length;n<len;++n) {
        tracePoint = tracers[n];
        if (!tracePoint.oob) {
          if (tracePoint.flags & Wolf.TRACE_HIT_DOOR) {
            sliceProps[n] = this.drawDoor(viewport, tracePoint, level);
          } else {
            sliceProps[n] = this.drawWall(viewport, tracePoint, level);
          }
        }
      }
      var sprites = this.drawSprites(viewport, level, visibleTiles);
      return {sliceProps: sliceProps, sprites: sprites};
    },
    draw: function(viewport, level, tracers, visibleTiles) {
      this.setState({
        viewport: viewport,
        level: level,
        tracers: tracers,
        visibleTiles: visibleTiles
      });
    },
    render: function() {
      if (!this.state.viewport) {
        return React.DOM.span();
      }
      var drawResult = this._draw(
        this.state.viewport,
        this.state.level,
        this.state.tracers,
        this.state.visibleTiles
      );
      var sliceProps = drawResult.sliceProps;
      var children = [];
      for (var x = 0; x < Wolf.XRES; x += Wolf.SLICE_WIDTH) {
        var currentSliceProps = sliceProps[x / Wolf.SLICE_WIDTH] || {};
        currentSliceProps.key = 'slice' + x;
        currentSliceProps.x = x;
        children.push(Slice(currentSliceProps));
      }
      return React.DOM.span(null, [children, drawResult.sprites]);
    }
  });

  var renderer = Renderer();

  function init() {
    if (hasInit) {
      return;
    }
    hasInit = true;
    $("#game .renderer")
      .width(Wolf.XRES + "px")
      .height(Wolf.YRES + "px");
    var container = document.createElement('span');
    $('#game .renderer').append(container);
    React.renderComponent(renderer, container);
  }

  function draw() {
    return renderer.draw.apply(renderer, arguments);
  }

  // React takes care of these for us!
  function clear() {
    // no-op
  }

  function loadSprite() {
    // no-op
  }

  function unloadSprite() {
    // no-op
  }

  function reset() {
    return renderer.reset.apply(renderer, arguments);
  }

  return {
    init : init,
    draw : draw,
    clear : clear,
    loadSprite : loadSprite,
    unloadSprite : unloadSprite,
    reset : reset
  };

})();
