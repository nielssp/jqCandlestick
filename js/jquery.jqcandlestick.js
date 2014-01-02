/*
jqCandlestick v0.1.0

Copyright (C) 2014 Niels Sonnich Poulsen
http://apakoh.dk

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
(function($) {
  var $window = $(window);

  $.fn.jqCandlestick = function(options) {
    if (options.theme) {
      if (!$.fn.jqCandlestick.themes[options.theme])
        throw 'Undefined theme: ' + options.theme;
      options = $.extend(true, {}, $.fn.jqCandlestick.themes[options.theme], options);
    }
    var settings = $.extend(true, {}, $.fn.jqCandlestick.defaults, options);
    var $container = this;
    $container.addClass(settings.containerClass);
    var $chartCanvas = $('<canvas/>')
      .attr(settings.chartCanvasAttrs)
      .appendTo($container);
    var $crossCanvas = $('<canvas/>')
      .attr(settings.crossCanvasAttrs)
      .appendTo($container);

    var chartCanvas = $chartCanvas.get(0);
    var crossCanvas = $crossCanvas.get(0);

    if (!chartCanvas.getContext || !crossCanvas.getContext) {
      throw 'canvas unsupported';
    }

    var data = settings.data;
    var offset = settings.xAxis.dataOffset;

    data.sort(function(a, b) {
      return a[offset] - b[offset];
    });

    if (settings.xAxis.min == null || settings.xAxis.max == null) {
      var min = null;
      var max = null;
      data.forEach(function(row) {
        if (min)
          min = Math.min(min, row[offset]);
        else
          min = row[offset];
        if (max)
          max = Math.max(max, row[offset]);
        else
          max = row[offset];
      });
      if (settings.xAxis.min == null)
        settings.xAxis.min = min;
      if (settings.xAxis.max == null)
        settings.xAxis.max = max;
    }

    var plotAreas = [];

    settings.yAxis = [].concat(settings.yAxis);

    var totalHeight = 0;

    settings.yAxis.forEach(function(axis) {
      axis = $.extend(true, {}, settings.yAxisDefaults, axis);
      totalHeight += axis.height;
      var plot = {
        yAxis: axis,
        height: axis.height,
        min: null,
        max: null,
        minY: null,
        maxY: null,
        series: [],
      };
      if (axis.labels.format.fixed !== null) {
        var numDecimals = axis.labels.format.fixed; 
        plot.formatLabel = function(value) {
          if (value != null)
            return value.toFixed(numDecimals);
          else
            return 'n/a';
        };
      }
      else if (typeof axis.labels.format === 'function') {
        plot.formatLabel = axis.labels.format;
      }
      else {
        plot.formatLabel = function(value) {
          return value;
        };
      }
      plotAreas.push(plot);
    });

    plotAreas.forEach(function(plot) {
      plot.height = plot.height / totalHeight;
    });

    settings.series.forEach(function(series) {
      series = $.extend(true, {}, settings.seriesDefaults, series);
      var plotArea = plotAreas[series.yAxis];
      if (!plotArea)
        throw 'Undefined y-axis: ' + series.yAxis;
      var type = $.fn.jqCandlestick.types[series.type];
      if (!type)
        throw 'Unknown plot type: ' + series.type;
      series = $.extend(true, {}, type, series); 
      var length = series.dataOffset + type.dataSize;
      data.forEach(function(row) {
        for (var i = series.dataOffset; i < length; i++) {
          if (row[i] == null)
            throw 'Missing data column: ' + i;
          if (plotArea.min)
            plotArea.min = Math.min(plotArea.min, row[i]);
          else
            plotArea.min = row[i];
          if (plotArea.max)
            plotArea.max = Math.max(plotArea.max, row[i]);
          else
            plotArea.max = row[i];
        }
      });
      plotArea.series.push(series);
    });

    plotAreas.forEach(function(plot) {
      var power = Math.pow(10, Math.floor(Math.log(plot.max) / Math.log(10)));
      plot.max = Math.ceil(plot.max / power) * power;
      plot.min = Math.floor(plot.min / power) * power;
    });

    var minX = 0;
    var maxX = 0;

    var getYValue = function(y) {
      var value = null;
      plotAreas.some(function(plot) {
        if (y >= plot.minY && y <= plot.maxY) {
          if (plot.min != null && plot.max != null) {
            value = plot.formatLabel(
              plot.max - (y - plot.minY) / (plot.maxY - plot.minY) * (plot.max - plot.min)
            );
          }
          else {
            value = 'n/a';
          }
          return true;
        }
        return false;
      });
      return value;
    };

    var getXValue = function(x) {
      return settings.xAxis.min + (x - settings.xAxis.minX) / (settings.xAxis.maxX - settings.xAxis.minX) * (settings.xAxis.max - settings.xAxis.min);
    };

    var getPlotValues = function(x) {
      if (x >= minX && x <= maxX) {
        var value = getXValue(x);
        var smallestIndex = null;
        var smallestDiff = null;
        for (var i = 0; i < data.length; i++) {
          var diff = Math.abs(data[i][settings.xAxis.dataOffset] - value);
          if (smallestDiff == null || diff < smallestDiff) {
            smallestDiff = diff;
            smallestIndex = i;
          }
          else {
            break;
          }
        }
        if (smallestIndex != null)
          return data[smallestIndex];
      }
      return null;
    };

    var getX = function(value) {
      return Math.floor(settings.xAxis.minX + (value - settings.xAxis.min) / (settings.xAxis.max - settings.xAxis.min) * (settings.xAxis.maxX - settings.xAxis.minX)) + 0.5;
    };

    var getY = function(plot, value) {
      return Math.floor(plot.maxY - (value - plot.min) / (plot.max - plot.min) * (plot.maxY - plot.minY)) + 0.5;
    };

    var redrawChart = function() {
      var ctx = chartCanvas.getContext('2d');
      var height = chartCanvas.height;
      var availableHeight = height - (plotAreas.length + 1) * settings.plot.spacing
        - settings.padding.top - settings.info.height - settings.padding.bottom - settings.xAxis.height;
      var y = settings.padding.top + settings.info.height + settings.plot.spacing + 0.5;
      minX = 0;
      maxX = chartCanvas.width - settings.padding.right;
      plotAreas.forEach(function(plot) {
        plot.minY = y;
        y += availableHeight * plot.height;
        plot.maxY = y;
        y += settings.plot.spacing;
        ctx.font = plot.yAxis.labels.font ? plot.yAxis.labels.font : settings.font;
        minX = Math.max(
          minX,
          ctx.measureText(plot.formatLabel(plot.min)).width,
          ctx.measureText(plot.formatLabel(plot.max)).width
        );
      });
      minX += settings.padding.left + 10 + 0.5;
      settings.xAxis.minX = minX + settings.plot.padding.left;
      settings.xAxis.maxX = maxX - settings.plot.padding.right;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      // Draw y-axes
      plotAreas.forEach(function(plot) {
        ctx.font = plot.yAxis.labels.font ? plot.yAxis.labels.font : settings.font;
        ctx.fillStyle = plot.yAxis.labels.color;
        ctx.strokeStyle = plot.yAxis.color;
        ctx.lineWidth = plot.yAxis.strokeWidth;
        var span = plot.max - plot.min;
        var numTicks;
        if (plot.yAxis.numTicks != null) {
          numTicks = plot.yAxis.numTicks;
        }
        else {
          numTicks = Math.ceil((plot.maxY - plot.minY) / plot.yAxis.tickDistance);
        }
        var yStep = (plot.maxY - plot.minY) / numTicks;
        var step = (plot.max - plot.min) / numTicks;
        var y = plot.minY + yStep / 2;
        var value = plot.max - step / 2;
        for (var i = 0; i < numTicks; i++) {
          ctx.fillText(plot.formatLabel(value), minX - 10, y);
          ctx.beginPath();
          ctx.moveTo(minX, Math.floor(y) + 0.5);
          ctx.lineTo(maxX, Math.floor(y) + 0.5);
          ctx.stroke();
          y += yStep;
          value -= step;
        }
      });

      // Draw x-axis
      if (settings.xAxis.height > 0) {
        ctx.strokeStyle = settings.xAxis.color;
        ctx.lineWidth = settings.xAxis.strokeWidth;
        ctx.beginPath();
        var xAxisStart = height - settings.xAxis.height - settings.padding.bottom - 0.5;
        ctx.moveTo(0, xAxisStart);
        ctx.lineTo(chartCanvas.width, xAxisStart);
        ctx.stroke();

        ctx.font = settings.xAxis.labels.font ? settings.xAxis.labels.font : settings.font;
        ctx.fillStyle = settings.xAxis.labels.color;
        ctx.textAlign = 'center';

        var xAxisMiddle = xAxisStart + settings.xAxis.height / 2;


        var span = settings.xAxis.max - settings.xAxis.min;

        var maxTicks = Math.ceil((settings.xAxis.maxX - settings.xAxis.minX) / 80);

        var maxStep = span / maxTicks;
        var minutes = maxStep / 60000;
        var hours = minutes / 60;
        var days = hours / 24;

        var validSteps = [
          60000, 2 * 60000, 5 * 60000, 10 * 60000, 15 * 60000, 30 * 60000,
          60 * 60000, 2 * 60 * 60000, 3 * 60 * 60000, 6 * 60 * 60000, 12 * 60 * 60000,
          24 * 60 * 60000,
        ];
        var step = 60000;
        for (var i = 0; i < validSteps.length; i++) {
          step = validSteps[i];
          if (maxStep <= step) {
            break;
          }
        }
        var value = Math.ceil(settings.xAxis.min / step) * step;

        var tickSize = settings.xAxis.tickSize;
        for (var x = getX(value); x < maxX; value += step, x = getX(value)) {
          var date = new Date(value);
          var label;
          if (date.getHours() == 0 && date.getMinutes() == 0) {
            label = settings.xAxis.months[date.getMonth()] + ' ' + date.getDate();
          }
          else {
            var hours = date.getHours();
            if (hours < 10)
              hours = '0' + hours;
            var minutes = date.getMinutes();
            if (minutes < 10)
              minutes = '0' + minutes;
            label = hours + ':' + minutes;
          }
          var labelWidth = ctx.measureText(label).width;
          if (x + labelWidth / 2 > maxX)
            continue;
          ctx.fillText(label, x, xAxisMiddle);
          ctx.beginPath();
          if (tickSize != 0) {
            ctx.moveTo(x, xAxisStart);
            ctx.lineTo(x, xAxisStart - tickSize);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = '#900';

      // Plot series
      plotAreas.forEach(function(plot) {
        plot.series.forEach(function(series) {
          series.draw(ctx, settings, plot, series, data, getX, getY);
        });
      });
    };

    var mouseX = 0;
    var mouseY = 0;
    var mouseMoved = false;
    
    $window.mousemove(function(event) {
      mouseMoved = true;
      mouseX = event.pageX - $container.offset().left + 0.5;
      mouseY = event.pageY - $container.offset().top + 0.5;
    });

    var previousWidth = 0;
    var previousHeight = 0;

    var resize = function() {
      if ($container.width() != previousWidth
          || $container.height() != previousHeight) {
        chartCanvas.width = $container.width();
        chartCanvas.height = $container.height();
        crossCanvas.width = $container.width();
        crossCanvas.height = $container.height();
        previousWidth = $container.width();
        previousHeight = $container.height();
        redrawChart();
      }
    };

    var redrawCross = function() {
      resize();
      if (!mouseMoved)
        return;
      mouseMoved = false;
      var ctx = crossCanvas.getContext('2d');
      ctx.strokeStyle = settings.cross.color
      ctx.lineWidth = settings.cross.strokeWidth;
      ctx.clearRect(0, 0, crossCanvas.width, crossCanvas.height);
      if (mouseX < 0 || mouseX >= crossCanvas.width)
        return;
      if (mouseY < 0 || mouseY >= crossCanvas.height)
        return;
      var values = getPlotValues(mouseX);
      if (values) {
        mouseX = getX(values[settings.xAxis.dataOffset]);
      }

      // Draw cross
      ctx.beginPath();
      ctx.moveTo(mouseX, 0);
      ctx.lineTo(mouseX, crossCanvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mouseY);
      ctx.lineTo(crossCanvas.width, mouseY);
      ctx.stroke();

      // Draw info
      if (values) {
        ctx.fillStyle = settings.info.color;
        ctx.font = settings.info.font ? settings.info.font : settings.font;
        if (settings.info.position == 'right')
          ctx.textAlign = 'right';
        else 
          ctx.textAlign = 'left';
        if (settings.info.position == 'auto')
          ctx.textBaseline = 'top';
        else
          ctx.textBaseline = 'middle';
        var middle = settings.padding.top + Math.floor(settings.info.height / 2) + 0.5;
        var info = [];
        var date = new Date(values[settings.xAxis.dataOffset]);
        info.push(settings.xAxis.name + ': ' + settings.info.formatDate(date));
        plotAreas.forEach(function(plot) {
          plot.series.forEach(function(series) {
            if (series.dataSize == 1) {
              info.push(series.name + ': ' + plot.formatLabel(values[series.dataOffset]));
            }
            else {
              for (var i = 0; i < series.dataSize; i++) {
                info.push(series.names[i] + ': ' + plot.formatLabel(values[series.dataOffset + i]));
              }
            }
          });
        });
        var y = middle;
        if (settings.info.position == 'right') {
          var x = maxX;
          info.forEach(function(text) {
            var width = ctx.measureText(text).width + settings.info.spacing;
            if (settings.info.wrap == 'auto' && x - width < minX) {
              x = maxX;
              y += settings.info.height;
            }
            ctx.fillText(text, x, y);
            if (settings.info.wrap == 'yes')
              y += settings.info.height;
            else
              x -= width;
          });
        }
        else {
          var x = minX;
          if (settings.info.position == 'auto') {
            x = mouseX + 5;
            y = mouseY + 5;
          }
          info.forEach(function(text) {
            var width = ctx.measureText(text).width + settings.info.spacing;
            if (settings.info.wrap == 'auto' && x + width > maxX) {
              if (settings.info.position == 'auto')
                x = mouseX + 5
              else
                x = minX;
              y += settings.info.height;
            }
            ctx.fillText(text, x, y);
            if (settings.info.wrap == 'yes')
              y += settings.info.height;
            else
              x += width;
          });
        }
      }

      // Draw y-axis label
      var text = getYValue(mouseY);
      if (text == null)
        return;
      var textWidth = ctx.measureText(text).width;
      var halfHeight = Math.floor(settings.cross.text.height / 2);
      var right = minX;
      var arrowStart = right - 5;
      var textStart = right - 10;
      var left = right - (textWidth + 15);
      if (mouseX < right) {
        left = right + (textWidth + 15);
        arrowStart = right + 5;
        textStart = left - 5;
      }
      ctx.beginPath();
      ctx.moveTo(left, mouseY - halfHeight);
      ctx.lineTo(arrowStart, mouseY - halfHeight);
      ctx.lineTo(right, mouseY);
      ctx.lineTo(arrowStart, mouseY + halfHeight + 1);
      ctx.lineTo(left, mouseY + halfHeight + 1);
      ctx.lineTo(left, mouseY - halfHeight);
      ctx.fillStyle = settings.cross.text.background;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = settings.cross.text.color;
      ctx.font = settings.cross.text.font ? settings.cross.text.font : settings.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, textStart, mouseY);
    };
    
    setInterval(redrawCross, 1000 / 60);
    return this;
  };

  $.fn.jqCandlestick.defaults = {
    series: [],
    data: [],
    theme: 'light',
    font: '8pt sans-serif',
    padding: {
      top: 0,
      left: 10,
      bottom: 0,
      right: 0,
    },
    plot: {
      spacing: 5,
      padding: {
        top: 0,
        left: 15,
        bottom: 0,
        right: 15,
      },
    },
    xAxis: {
      name: 'DATE',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      dataOffset: 0,
      min: null,
      max: null,
      minX: 0,
      maxX: 0,
      height: 20,
      color: '#333',
      strokeWidth: 1.0,
      tickSize: 5,
      labels: {
        font: null,
        color: '#999',
        format: 'date',
      },
    },
    yAxis: [{
      height: 1
    }],
    yAxisDefaults: {
      height: 1,
      color: '#222',
      strokeWidth: 1.0,
      numTicks: null,
      tickDistance: 40,
      labels: {
        font: null,
        color: '#999',
        format: {
          fixed: 2,
        },
      },
    },
    seriesDefaults: {
      type: 'point',
      name: null,
      names: [],
      dataOffset: 1,
      yAxis: 0,
      color: '#fff',
    },
    info: {
      color: '#999',
      height: 20,
      font: null,
      spacing: 20,
      position: 'left', // 'left', 'right' or 'auto'
      wrap: 'auto', // 'auto', 'yes' or 'no'
      formatDate: function(date) {
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        if (month < 10)
          month = '0' + month;
        var day = date.getDate();
        if (day < 10)
          day = '0' + day;
        var hours = date.getHours();
        if (hours < 10)
          hours = '0' + hours;
        var minutes = date.getMinutes();
        if (minutes < 10)
          minutes = '0' + minutes;
        return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;

      },
    },
    cross: {
      color: 'rgba(255, 255, 255, 0.5)',
      strokeWidth: 1.0,
      text: {
        height: 20,
        background: '#000',
        font: null,
        color: '#999',
      },
    },
    containerClass: 'jqcandlestick-container',
    chartCanvasAttrs: {
      class: 'jqcandlestick-canvas',
    },
    crossCanvasAttrs: {
      class: 'jqcandlestick-canvas',
    },
  };

  $.fn.jqCandlestick.themes = {
    light: {
      xAxis: {
        color: '#333',
        labels: {
          color: '#222',
        },
      },
      yAxisDefaults: {
        color: '#eee',
        labels: {
          color: '#222',
        },
      },
      seriesDefaults: {
        color: '#000',
      },
      cross: {
        color: 'rgba(0, 0, 0, 0.5)',
        text: {
          background: '#fff',
          color: '#222',
        }
      },
      info: {
        color: '#222',
      }
    },
    dark: {
      xAxis: {
        color: '#333',
        labels: {
          color: '#999',
        },
      },
      yAxisDefaults: {
        color: '#222',
        labels: {
          color: '#999',
        },
      },
      seriesDefaults: {
        color: '#fff',
      },
      cross: {
        color: 'rgba(255, 255, 255, 0.5)',
        text: {
          background: '#000',
          color: '#999',
        }
      },
      info: {
        color: '#999',
      }
    },
  };

  $.fn.jqCandlestick.types = {
    point: {
      dataSize: 1,
      radius: 3,
      stroke: null,
      strokeWidth: 2.0,
      draw: function(ctx, settings, plot, series, data, getX, getY) {
        ctx.fillStyle = series.color;
        ctx.lineWidth = series.strokeWidth;
        data.forEach(function(row) {
          var x = getX(row[settings.xAxis.dataOffset]);
          var y = getY(plot, row[series.dataOffset]);
          ctx.beginPath();
          ctx.arc(x, y, series.radius, 0, Math.PI * 2, true);
          ctx.fill();
          if (series.stroke) {
            ctx.strokeStyle = series.stroke;
            ctx.lineWidth = series.strokeWidth;
            ctx.stroke();
          }
        });
      },
    },
    line: {
      dataSize: 1,
      strokeWidth: 2.0,
      draw: function(ctx, settings, plot, series, data, getX, getY) {
        ctx.strokeStyle = series.color;
        ctx.lineWidth = series.strokeWidth;
        ctx.beginPath();
        var previousX = null;
        var previousY = null;
        data.forEach(function(row) {
          var x = getX(row[settings.xAxis.dataOffset]);
          var y = getY(plot, row[series.dataOffset]);
          if (previousX && previousY)
            ctx.lineTo(x, y);
          else
            ctx.moveTo(x, y);
          previousX = x;
          previousY = y;
        });
        ctx.stroke();
      },
    },
    column: {
      dataSize: 1,
      width: 5,
      stroke: null,
      strokeWidth: 1.0,
      draw: function(ctx, settings, plot, series, data, getX, getY) {
        ctx.fillStyle = series.color;
        if (series.stroke) {
          ctx.strokeStyle = series.stroke;
          ctx.lineWidth = series.strokeWidth;
        }
        data.forEach(function(row) {
          var x = getX(row[settings.xAxis.dataOffset]);
          var y = getY(plot, row[series.dataOffset]);
          ctx.fillRect(Math.floor(x - series.width / 2) + 0.5, y, series.width, plot.maxY - y); 
          if (series.stroke)
            ctx.strokeRect(Math.floor(x - series.width / 2) + 0.5, y, series.width, plot.maxY - y); 
        });
      },
    },
    candlestick: {
      dataSize: 4,
      names: ['OPEN', 'HIGH', 'LOW', 'CLOSE'],
      width: 5,
      downColor: null,
      downStroke: null,
      downStrokeWidth: 1.0,
      upColor: null,
      upStroke: null,
      upStrokeWidth: 1.0,
      draw: function(ctx, settings, plot, series, data, getX, getY) {
        data.forEach(function(row) {
          var open = row[series.dataOffset];
          var high = row[series.dataOffset + 1];
          var low = row[series.dataOffset + 2];
          var close = row[series.dataOffset + 3];
          var x = getX(row[settings.xAxis.dataOffset]);
          var yOpen = getY(plot, open);
          var yHigh = getY(plot, high);
          var yLow = getY(plot, low);
          var yClose = getY(plot, close);
          var halfWidth = Math.floor(series.width / 2);
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.strokeStyle = series.color;
          if (yClose > yOpen) {
            if (series.downColor)
              ctx.fillStyle = series.downColor;
            else
              ctx.fillStyle = series.color;
            ctx.fillRect(x - halfWidth, yOpen, series.width, yClose - yOpen); 
            if (series.downStroke) {
              ctx.strokeStyle = series.downStroke;
              ctx.lineWidth = series.downStrokeWidth;
              ctx.strokeRect(x - halfWidth, yOpen, series.width, yClose - yOpen); 
            }
            ctx.lineTo(x, yOpen);
            ctx.moveTo(x, yClose);
          }
          else {
            if (series.upColor) {
              ctx.fillStyle = series.upColor;
              ctx.fillRect(x - halfWidth, yClose, series.width, yOpen - yClose); 
            }
            if (series.upStroke)
              ctx.strokeStyle = series.upStroke;
            else
              ctx.strokeStyle = series.color;
            ctx.lineWidth = series.upStrokeWidth;
            ctx.strokeRect(x - halfWidth, yClose, series.width, yOpen - yClose); 
            ctx.lineTo(x, yClose);
            ctx.moveTo(x, yOpen);
          }
          ctx.lineTo(x, yLow);
          ctx.stroke();
        });
      },
    },
  };

}(jQuery));
