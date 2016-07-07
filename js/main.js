L.icon = function (options) {
    return new L.Icon(options);
};

SymbolIcon = L.Icon.extend({
    options: {
        iconUrl: 'mapmarkers/marker-default.svg',
        iconSize:     [26, 32],
        iconAnchor:   [13, 32],
        popupAnchor:  [0, -14]
    }
});

L.HeatLayer.prototype.getLatLng = function() {
	return (this.hasOwnProperty('_latlngs')) ? this._latlngs : [];
};

L.MarkerClusterGroup.prototype.getLatLng = function() {
	return $.map(this._featureGroup._layers, function(layer) { return layer._latlng });
};

var parseComments = function(commentdata) {
	var comments = {};
	$.each(commentdata, function(i, d) {
		if (d.hasOwnProperty('plugin_data') && d.plugin_data) {
			var parsed = JSON.parse(d.plugin_data);
			$.each(parsed, function(j, c) {
				$.each(c, function(k, comment) {
					if (!comment.hasOwnProperty('type')) {
						comment.type = '0';
					}
					if (!comments.hasOwnProperty(comment.type)) {
						comments[comment.type] = [];
					}
					comments[comment.type].push(comment);
				});
			});
		}
	});
	return comments;
}

var showModal = function(data) {
	var template = Handlebars.compile($("#template-bootstrap-modal").html());
	var modal = template({ title: data.title, content: data.content });
	$(modal)
		.modal()
		.on('hidden.bs.modal', function () {
			$(this).remove();
		});	
}

var UUID = function() {
    'use strict';
	var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
}

// Helsinki WTMS
// adapted from Helsinki service map (palvelukartta.hel.fi) to use the city's custom map tiles from geoserver.hel.fi

var makeLayer = function() {
	var bounds, crsName, crsOpts, originNw, projDef;
	crsName = 'EPSG:3067';
	projDef = '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
	bounds = L.bounds(L.point(-548576, 6291456), L.point(1548576, 8388608));
	originNw = [bounds.min.x, bounds.max.y];
	crsOpts = {
		resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125],
		bounds: bounds,
		transformation: new L.Transformation(1, -originNw[0], -1, originNw[1])
	};
	return new L.Proj.CRS(crsName, projDef, crsOpts);
}

var tm35 = makeLayer(),
	worldSouthWest = tm35.projection.unproject(tm35.options.bounds.min),
	worldNorthEast = tm35.projection.unproject(tm35.options.bounds.max);
	worldLatLngs = [L.latLng(worldNorthEast.lat, worldNorthEast.lng), L.latLng(worldNorthEast.lat, worldSouthWest.lng), L.latLng(worldSouthWest.lat, worldNorthEast.lng), L.latLng(worldSouthWest.lat, worldSouthWest.lng)];
	worldOrigo = L.latLng((worldNorthEast.lat - worldSouthWest.lat) / 2, (worldNorthEast.lng - worldSouthWest.lng) / 2);

var tilelayer = L.tileLayer('http://geoserver.hel.fi/mapproxy/wmts/osm-sm/etrs_tm35fin/{z}/{x}/{y}.png');


// init leaflet base map
Canvas = L.map('map-canvas', {
	crs : tm35,
	continuousWorld: true,
	maxZoom: 15,
	minZoom: 4,
	layers 		: [tilelayer],
	zoomControl	: false
});

Canvas.init = function(postmessage) {
	
	var me = this;
	
	// clear all potentially existing old features
	me.removeFeatures();
	
	// init/reset all primary containers
	if (postmessage.hasOwnProperty('comments')) {
		var commentdata = (typeof postmessage.comments === 'string') ? JSON.parse(postmessage.comments) : postmessage.comments;
		me.commentdata = parseComments(commentdata);
	} else {
		me.commentdata = [];	
	}
	
	if (postmessage.hasOwnProperty('data')) {
		me.mapdata = (typeof postmessage.data === 'string') ? JSON.parse(postmessage.data) : postmessage.data
	} else {
		me.mapdata = {};
	}

	me.userdata = [];
	me.features = [];
	
	me.setInstanceId(postmessage.instanceId);
	me.setPurpose(postmessage.pluginPurpose);
	me.setLanguage('fi');
	me.setState(0);
	
}


Canvas.setInstanceId = function(instanceId) {
	var me = this;
	me.instanceId = instanceId;	
}

Canvas.getInstanceId = function() {
	var me = this;
	return me.instanceId;
}

Canvas.setPurpose = function(purpose) {
	var me = this;
	me.purpose = (purpose) ? purpose : false;	
}

Canvas.getPurpose = function() {
	var me = this;
	return me.purpose;
}

Canvas.setLanguage = function(language) {
	var me = this;
	me.language = language;
}

Canvas.getLanguage = function() {
	var me = this;
	return me.language;
}

Canvas.setTitle = function(title) {
	title = title || '';
	$('#map-title').html(title);	
}

Canvas.getTitle = function() {
	
}

Canvas.setDescription = function(description) {
	description = description || '';
	$('#map-description').html(description);	
}

Canvas.getDescription = function() {
	
}

Canvas.setState = function(state) {
	
	var me = this;
	
	var language = me.getLanguage();
	var purpose = me.getPurpose();
	
	var commentdata = me.commentdata;
	var mapdata = me.mapdata;
	var userdata = me.userdata;
	
	var catalog = mapdata.catalog || {};
	var states = mapdata.states || [];
	
	state = Math.max(state, 0);
	state = Math.min(state, states.length -1);
	
	me.state = state;
	
	if (!userdata.hasOwnProperty(state))
		userdata[state] = {}
	
	// init blank containers
	
	me.boundary = null;
	me.budget = {};
	me.catalog = catalog;
	me.design = [];
	me.menu = [];
	
	me.removeFeatures();
	
	if (purpose == 'viewHeatmap') {

		var bounds = [];
		
		$.each(commentdata, function(type, comments) { 
			
			var locations = $.map(comments, function(comment) {
				if (comment.removable == false && comment.dragged != true && comment.comment) {
				} else {
					return [[comment.lat, comment.lng]];
				}
			});
			
			var settings = {
				blur		: 20,
				minOpacity	: .5,
				pane		: 'tilePane',
				radius		: 20,
				zIndex		: -1
			}

			if (catalog.hasOwnProperty(type) && catalog[type].hasOwnProperty('color')) {
				var rgb = catalog[type].color;
				settings.gradient = {
					0.25 	: rgb,
					0.50	: rgb,
					0.75	: rgb,
					1.00	: rgb			  
				};
			}
			
			var heatmap = L.heatLayer(locations, settings).addTo(me);
				
			me.addFeature(heatmap);
			
			bounds = bounds.concat(locations);
		
		});
		
		if (bounds.length > 0) {
			
			me.fitBounds(bounds);
			
		}
		
	}
	
	if (purpose == 'viewComments') {
		
		var clusters = L.markerClusterGroup({
			showCoverageOnHover: false
		});
		
		var bounds = [];
		
		$.each(commentdata, function(i, comments) { 
			
			$.each(comments, function(j, d) {

				bounds.push([d.lat, d.lng]);
			
				// convert latlng array to leaflet latlng object
				d.latlng = L.latLng([d.lat, d.lng]); 
				d.removable = false;
				d.draggable = false;
				
				var entry = me.addEntry(d);
				clusters.addLayer(entry.marker);

			});
		
		});

		if (bounds.length > 0) {
			
			me.addFeature(clusters);
			me.fitBounds(bounds);
			
		}

	}
	
	if (purpose == 'postComments') {
	
		if (states.hasOwnProperty(state)) {
	
			var boundary = states[state].boundary || null;
			var budget = states[state].budget || null;
			var design = states[state].design || [];
			var menu = states[state].menu || null;
			
			// if geojson boundaries passed, draw an inverted polygon on map to mask out other (non-allowed) areas
			if (boundary && boundary.hasOwnProperty('features')) {
		
				var boundary = L.geoJson(boundary, {
					className	: 'leaflet-click-dragblocker',
					clickable	: true,
					color		: '#000',
					fill		: '#000',
					fillOpacity	: 0.25,
					invert		: true,
					opacity		: 0.25,
					weight		: 1,
					worldLatLngs: worldLatLngs
				}).addTo(me);
				
				boundary.on('click', function(e) {
					me.setActive();
				});
				
				me.addFeature(boundary);
				me.fitBounds(boundary.getBounds());
		
			};
			
			me.boundary = boundary;
			me.budget = budget;
			me.catalog = catalog;
			me.design = design;
			me.menu = menu;
			
			// if a base design was given, add it on map
			if (design) {
				$.each(design, function(i, d) {
					d.latlng = L.latLng(d.latlng); // convert latlng array to leaflet latlng object
					var entry = me.addEntry(d);
					me.addFeature(entry.marker);
				});
			}
			
			// restore a previously stored state
			if (userdata && userdata.hasOwnProperty(state)) {
				$.each(userdata[state], function(i, d) {
					var entry = me.addEntry(d);
					me.addFeature(entry.marker);
				});			   
			}
			
		}
		
	}
	
	var title = (states.hasOwnProperty(state) && states[state].hasOwnProperty('title')) ? states[state].title[language] : '';
	var description = (states.hasOwnProperty(state) && states[state].hasOwnProperty('description')) ? states[state].description[language] : '';
	
	me.setTitle(title);
	me.setDescription(description);
	
	me.update();

}

Canvas.getState = function() {
	var me = this;
	return me.state;
}

Canvas.setActive = function(id) {
	
	var me = this;
	
	var active = me.getActive();
	var language = me.getLanguage();
	var purpose = me.getPurpose();
	var state = me.getState();
	
	var userdata = me.userdata[state];
	
	var mapdata = me.mapdata;
	var catalog = me.catalog;
	var states = me.states;
	var budget = me.budget;
	
	// deactivate the current entry first
	if (active) {	
		var latlng = active.latlng || false,
			type = active.type || false;
			comment = active.comment || false;
		// check if user is closing a popup that has no type selected
		if (latlng && (type || comment)) {
			// user has selected an option or added a comment
			// this is ok, do nothing
		} else {
			// user is closing a popup without a selection, delete all
			me.removeEntry(active.id);
		}	
	}
	
	var entry = userdata[id] || false;
	var template, title, content = '', html = '';
	
	if (entry) {
		
		if (purpose == 'postComments') {
		
			if (entry.removable == false) {
				
				// this is a predefined entry that user cannot modify
				
				template = Handlebars.compile($("#template-mmenu-container").html());
				/*if (entry.hasOwnProperty('properties')) {
					content += '<p>' + JSON.stringify(entry.properties) + '</p>';
				}*/
				title = catalog[entry.type].title[language];
				html = template({ title: title, content: content });	
			
			} else if (me.menu.options.length == 1) {
				
				// if there is only user-selectable marker type available on the menu, 
				// -> don't display the menu at all and select the type automatically
				if (!entry.hasOwnProperty('type')) entry.setType(me.menu.options[0]);
				
				template = Handlebars.compile($("#template-mmenu-container").html());
				title = catalog[me.menu.options[0]].title[language];
				html = template({ title: title, content: content });
				
			} else {
			
				// open a new entry
				// check the latest menu and catalog options and render html
				var renderRecursive = function(data) {
					
					if (typeof data === 'string') {
						if (catalog.hasOwnProperty(data)) {
							var properties = {
								id			: data,
								title		: catalog[data].title[language],
								description	: catalog[data].description[language],
								cost		: {
									title	: budget[catalog[data].cost.units].units[language],
									units	: catalog[data].cost.units,
									value	: catalog[data].cost.value
								},
								image		: catalog[data].image,
								thumbnail	: catalog[data].thumbnail,
								iconUrl		: catalog[data].iconUrl
							};
							template = Handlebars.compile($("#template-mmenu-option-select").html());
							html = template(properties);
							return html;
						}
					} else if (data.hasOwnProperty('title') && data.hasOwnProperty('options')) {
						var ul = '';
						$.each(data, function(i, d) {
							if (i == 'options') ul += renderRecursive(d);
						});
						template = Handlebars.compile($("#template-mmenu-option-expand").html());
						html = template({ title : data.title[language], menu : ul});
						return html;
					}  else {
						$.each(data, function(i, d) {
							html += renderRecursive(d);
						});
						return html;
					}
				}
				
				template = Handlebars.compile($("#template-mmenu-container").html());
				html = template({ title: me.menu.title[language], menu : renderRecursive(me.menu.options) });		
			
			}
			
		} else if (purpose == 'viewComments') {
		
			template = Handlebars.compile($("#template-mmenu-container").html());
			title = (catalog.hasOwnProperty(entry.type)) ? catalog[entry.type].title[language] : '';
			content = entry.comment;
			html = template({ title: title, content: content });
			
			
		}
				
		var popup = entry.popup;
		var marker = entry.marker;		
		
		popup.setContent(html);
		popup.openOn(me);
		me.initMMenu(entry);
		me.active = entry;
	
	} else {
		
		me.closePopup();
		me.active = null;
	
	}
	
	me.update();

}
	
Canvas.getActive = function() {
	var me = this;
	var active = me.active || false;
	return active;
}

Canvas.clickCanvas = function(e) {
	var me = this;
	var purpose = me.getPurpose();
	if (purpose == 'postComments') {
		var state = me.getState();
		if (me.dragBlock) {
			// drag block is set to true when user starts dragging any marker
			// this is done to prevent the Canvas click event, fired after the marker dragend event, from opening an unwanted popup
			me.dragBlock = null;
		} else if (me.getActive()) {
			// there's a popup open somewhere, do not add a new entry before it is closed
			me.setActive();
		} else if (me.userdata.hasOwnProperty(state)) {
			// all clear, create a new entry
			var entry = me.addEntry({ latlng : e.latlng });
			// add marker to map
			me.addFeature(entry.marker);
			// set active -> open popup
			me.setActive(entry.id);
		}
	}
}

Canvas.addEntry = function(properties) {
	
	var me = this;
	
	var language = me.getLanguage();
	var purpose = me.getPurpose();
	var state = me.getState();
	
	var userdata = me.userdata[state];
	var mapdata = me.mapdata;
	
	var boundary = me.boundary;
	var budget = me.budget;
	var catalog = me.catalog;

	if (properties.hasOwnProperty('id') && userdata.hasOwnProperty(properties.id)) {
		
		var entry = userdata[properties.id];
	
		return entry;
		
	} else {

		var latlng = properties.latlng;
		var draggable = (properties.hasOwnProperty('draggable')) ? properties.draggable : true;
		var removable = (properties.hasOwnProperty('removable')) ? properties.removable : true;
		var className = (draggable) ? 'leaflet-marker-draggable' : 'leaflet-marker-fixed';
		var iconUrl = (properties.hasOwnProperty('type') && catalog.hasOwnProperty(properties.type)) ? catalog[properties.type].iconUrl : SymbolIcon.prototype.options.iconUrl;
		var marker = properties.marker || L.marker(latlng, { draggable : draggable, icon : new SymbolIcon({iconUrl : iconUrl, className : className }), riseOnHover : draggable});
		var popup = properties.popup || L.popup({ autoPanPadding : L.point(5,20), className: 'leaflet-popup-mmenu', closeButton : false, maxHeight: 320 });
		
		marker
			//.addTo(me)
			.setLatLng(latlng)
			.bindPopup(popup);

		popup
			.setLatLng(latlng);

		var id = properties.id || marker._leaflet_id || UUID();
		var entry = properties;
		
		
		// dragblock is required to catch and prevent the extra click event fired afted dragend
		//marker.on('dragstart', function(f) {					  
			// me.dragBlock = true;
			
		//});
		
		
		// check whether drag event's latlng hits any boundaries
		marker.on('drag', function(f) {
			
			var ll = f.target.getLatLng();
			var clashing = leafletPip.pointInLayer(ll, boundary, true);				
			if (clashing.length > 0) {
				// marker is above one or more non-allowed polygons, revert to previous position
				me.dragBlock = true;
				marker.setLatLng(entry.latlng);
			} else {
				// all clear, store current position 
				entry.latlng = ll;
			}
			
		});
		
		// update after drag to store new coordinates
		marker.on('dragend', function(f) {
			entry.dragged = true; // store an indication that (a predefined) entry has been repositioned
			me.update();
		});
		
		// disable all default click behaviors
		marker.off('click');
		
		// define custom click behaviors
		marker.on('click', function(f) {
			if (me.dragBlock) {
				// dragblock prevents popup from showing after dragend
				// dragend fires an additional click event in the element that is under the cursor
				// the first click event is captured here to switch off the dragblock
				//me.dragBlock = null;
			} else {
				// no dragblocks ahead, open popup upon click
				me.setActive(id);
			}
		});
		
		entry.id = id;
		entry.marker = marker;
		entry.popup = popup;
		
		entry.setType = function(type) {
			
			var $mmenu = $('.leaflet-popup-content > .mmenu');
			var $done = $mmenu.find('[data-action="marker-done"]');
			var $remove = $mmenu.find('[data-action="marker-remove"]');
			var success = false;
			
			if (type) {
				// before actually setting the type, check that there is budget remaining for this 
				if (catalog.hasOwnProperty(type)) {
					var units = catalog[type].cost.units;
					var price = catalog[type].cost.value;
					var remaining = me.getRemaining(units);
					// if the type has already been defined and it uses the same units
					if (entry.getType() && units == catalog[entry.type].cost.units) {
						// then don't include it in the current costs
						remaining += catalog[entry.getType()].cost.value;
					}
					// set the type, if current budget allows
					if (remaining >= price) {
						entry.type = type;
						$done.removeClass('disabled');
						success = true;
					}
					if (success) {
						var iconUrl = catalog[type].hasOwnProperty('iconUrl') ? catalog[type].iconUrl : SymbolIcon.prototype.options.iconUrl;
						var className = (entry.hasOwnProperty('draggable')) ? 'leaflet-marker-draggable' : 'leaflet-marker-fixed';
						entry.marker.setIcon(new SymbolIcon({iconUrl : iconUrl, className : className }));
					}
				}			
			}
			
			if (removable)
				$remove.removeClass('disabled');
			
			userdata[id] = entry;
			
			// return true if there was still budget remaining and we were able to set the type
			return success;
		
		}
		
		entry.getType = function() {
			return (entry.hasOwnProperty('type')) ? entry.type : false;
		}
		
		entry.viewDetails = function(type) {
			if (catalog.hasOwnProperty(type)) {
				var title = catalog[type].title[language];
				var content = '';
				if (catalog[type].hasOwnProperty('image'))
					content += '<p>' + '<img src="' + catalog[type].image + '" class="img-responsive" />' + '</p>';
				if (catalog[type].hasOwnProperty('description'))
					content += '<p>' + catalog[type].description[language] + '</p>';
				showModal({ title : title, content : content });
			}
		}
		
		entry.setType();

		return entry;
		
	}
	
}

Canvas.removeEntry = function(id) {
	var me = this;
	var state = me.getState();
	var userdata = me.userdata[state];
	var entry = userdata[id] || false;
	if (entry) {
		var marker = entry.marker;
		me.removeLayer(marker);
		delete userdata[id];
	}
}
	
Canvas.addFeature = function(feature) {
	var me = this;
	me.features.push(feature);
	me.addLayer(feature);
}

Canvas.removeFeatures = function() {
	var me = this;
	var features = me.features || [];
	while (features.length > 0) {
		var feature = features.pop();
		me.removeLayer(feature);
	};
}


Canvas.initMMenu = function(entry) {
	var me = this;
	var budget = me.budget;
	var catalog = me.catalog;
	var state = me.getState();
	var language = me.getLanguage();
	var mapdata = me.mapdata;
	var userdata = me.userdata[state];

	// locate .mmenu element 
	var $mmenu = $('.leaflet-popup-content > .mmenu');

	// init mmenu inside leaflet popup
	$mmenu.mmenu({
		autoHeight: true,
		navbars	: [
			{ 
				position : 'top', 
				content : [ "prev", "title", "next" ]
			},
			{ 
				position : 'bottom',
				content :  $mmenu.find('#mm-footer').html()
			}
		],
		offCanvas: false
	});
	
	// subscribe to current mmenu element's API for some UI tweaks and extra smoothness
	var	api = $mmenu.data("mmenu") || false,
		comment = entry.comment || false,
		draggable = (entry.hasOwnProperty('draggable')) ? entry.draggable : true,
		removable = (entry.hasOwnProperty('removable')) ? entry.removable : true,
		type = entry.getType();
		
	var $comment = $mmenu.find('#mm-comment'),
		$done = $mmenu.find('[data-action="marker-done"]'),
		$remove = $mmenu.find('[data-action="marker-remove"]'),
		$panel = [],
		$listitem = [];
	
	if (comment) {
		$comment.html(comment);	
	}
	
	if (api) {
		api
			.bind("setSelected", function($element) {				
				var $panels = $element.closest('.mm-panels');
				var stack = [$element];
				// remove selected-class from all list items
				$panels.find('li').removeClass('mm-selected-parent');
				// recursively add selected-class to list items that are panel's ancestors
				while(stack.length > 0) {
					var target = stack.shift().closest('.mm-panel').attr('id'),
						$elements = $panels.find('.mm-listview [data-target="#' + target + '"]');
					if ($elements.length > 0) {
						$listitem = $elements.first().closest('li').addClass('mm-selected-parent');	
						stack.push($listitem);
					}
				}
				me.update();
			});
	}
	
	
	if (removable == false) {
		$panel = [];
		$remove.addClass('disabled');
	} else if (type) {
		$listitem = $mmenu.find('[data-action="option-select"][data-type="' + type + '"]').closest('li');
		$panel = $listitem.closest('.mm-panel');
	} else if (comment) {
		$panel = [];
	} else {
		$done.addClass('disabled');
	}
	
	// check that there is currently a visible listitem that needs to be selected
	if ($listitem.length == 1) {
		api.setSelected($listitem);
	}
	if ($panel.length == 1) {
		api.openPanel($panel);
	}
	
	// init remaining mmenu interactions
	$mmenu
		.on( 'click', '[data-action="option-expand"]', function(e) {
			var target = $(this).parent().find('a[data-target]').data('target');
			api.openPanel($(target));
			return false;
		})
		.on( 'click', '[data-action="option-select"][href]', function(e) {
			var $clicked = $(this);
			var type = $clicked.data('type');
			// check that there is still budget remaining before applying select
			var selected = entry.setType(type);
			return selected;
		})
		.on( 'click', '[data-action="modal-show"]', function(e) {
			e.preventDefault();
			var $clicked = $(this);
			var type = $clicked.data('type');
			entry.viewDetails(type);
		})
		.on( 'click', '[data-action="marker-close"], [data-action="marker-done"]', function(e) {
			e.preventDefault();
			me.setActive();
		})
		.on( 'click', '[data-action="marker-remove"]', function(e) {
			e.preventDefault();
			me.removeEntry(entry.id);
			me.setActive();
		});

	$comment.on('keyup', function() {
		var t = $(this).val() || entry.getType() || false;
		$done.toggleClass('disabled', !t);
		entry.comment = $(this).val();
		me.update();
	});

}

Canvas.getBudget = function(key) {
	var me = this;
	var budget = me.budget;
	if (budget.hasOwnProperty(key)) {
		return budget[key].value;
	} else {
		return false;	
	}
}

Canvas.getCosts = function(key) {
	var me = this;
	var budget = me.budget;
	var catalog = me.catalog;
	var state = me.getState();
	var userdata = me.userdata[state];
	var costs = {};
	$.each(userdata, function(i, d) {
		if (d.type) {
			var cost = catalog[d.type].cost;
			if (!costs.hasOwnProperty(cost.units)) {
				costs[cost.units] = 0;
			}
			costs[cost.units] += cost.value;
		}
	});
	if (costs.hasOwnProperty(key)) {
		return costs[key];	
	} else {
		return 0;
	}
}

Canvas.getRemaining = function(key) {
	var me = this;
	var total = me.getBudget(key);
	var costs = me.getCosts(key);
	console.log(total, costs);
	if (total !== false && costs !== false) {
		return total - costs;	
	} else {
		return false;	
	}
}
	
Canvas.update = function() {
	
	var me = this;
	
	var instanceId = me.getInstanceId();
	var language = me.getLanguage();
	var purpose = me.getPurpose();
	var state = me.getState();
	
	var mapdata = me.mapdata;
	var userdata = me.userdata[state] || [];
	
	var states = mapdata.states || [];

	var budget = me.budget;
	var catalog = me.catalog;
	var menu = me.menu;
	
	var costs = {};
	var remaining = {};
	
	$.each(userdata, function(i, d) {
		if (d.type && catalog.hasOwnProperty(d.type)) {
			var cost = catalog[d.type].cost;
			if (!costs.hasOwnProperty(cost.units)) {
				costs[cost.units] = 0;
			}
			costs[cost.units] += cost.value;
		}
	});
	
	$.each(budget, function(key, d) {
		if (!remaining.hasOwnProperty(key)) {	
			var title = budget[key].title[language];
			var units = budget[key].units[language];
			var value = budget[key].value
			remaining[key] = {
				title : title,
				units : units,
				value : value
			}
		}
		if (costs[key]) {
			remaining[key].value -= costs[key];
		}
	});

	var active = me.getActive() || false;
	
	// check if there's a popup menu open that needs updating
	if (active) {
		
		var affordable = 0;
		var type = active.getType();
		
		if (menu.hasOwnProperty('options')) {
		
			$.each(menu.options, function(i, key) {
				var units = catalog[key].cost.units;
				var value = catalog[key].cost.value;
				var rem = remaining[units].value;
				if (type && units == catalog[type].cost.units) {
					rem += catalog[type].cost.value;
				}
				var $option = $('[data-action="option-select"][data-type="' + key + '"]');
				var $listitem = $option.parent('li');
				if (rem >= value) {
					// enable all options the user can afford
					$listitem.removeClass('mm-disabled');
					$option.attr('href', '#');
					affordable ++;
				} else {
					// disable all options the user can't afford	
					$listitem.addClass('mm-disabled');
					$option.removeAttr('href');
				}
				
			});
			
			
		}
		
		var $listview = $('.mm-opened .mm-listview');
		var $form = $('.mm-form');
		var $alert = $('.mm-alert');
		 
		if (purpose == 'postComments') {
		 
			if (affordable > 0) {
				// user can still afford something on the menu, display interactive elements
				$listview.removeClass('hide');
				$form.removeClass('hide');
				$alert.addClass('hide');
			} else {
				// user can't afford anything, hide all interactive elements and display error message instead
				$listview.addClass('hide');
				$form.addClass('hide');
				$alert.removeClass('hide');
			}
			
		} else {
			
			$alert.addClass('hide');
			$form.addClass('hide');
			
		}
	
	}
	
	// display remaining budget on screen
	remainingArr = $.map(remaining, function(r) { return r });
	
	if (remainingArr.length > 0) {
		var template = Handlebars.compile($("#template-map-outputs").html());
		var html = template({remaining : remainingArr });
		$("#map-outputs").html(html);
	} 
	
	// disable/enable back next buttons
	$('[data-action="state-prev"]').prop('disabled', state == 0);
	$('[data-action="state-next"]').prop('disabled', state == states.length - 1);
	
	// hide stuff that is not needed in current view
	$("#map-outputs").toggleClass('hide', remainingArr.length == 0);
	$("#map-navigation").toggleClass('hide', states.length < 2);
		
	//me.serialize();
	
	window.parent.postMessage({ message: 'userDataChanged', instanceId: instanceId }, '*');

}
	
Canvas.serialize = function(postmessage) {
		
	var me = this;
	var instanceId = me.getInstanceId();
	var purpose = me.getPurpose();
		
	if (postmessage.instanceId == instanceId && purpose == 'postComments') {
	
		var userdata = me.userdata;
		var catalog = me.catalog;
		
		var serialized = [];
		
		if (userdata) {
		
			$.each(userdata, function(i, s) {
				
				var state = [];
				
				$.each(s, function(j, d) {
				
					if (d.draggable != false && (d.removable != false || d.dragged == true) || d.comment) {
				
						var entry = {};
						
						var latlng = d.latlng || false;
						
						if (latlng.lat && latlng.lng) {
							entry.lat = latlng.lat;
							entry.lng = latlng.lng;
						}
						
						if (d.type) {
							entry.type = d.type;
						}
						
						if (d.comment) {
							entry.comment = d.comment;
						}
						
						if (d.dragged) {
							entry.dragged = d.dragged;
						}
						
						if (d.type && catalog.hasOwnProperty(d.type) && catalog[d.type].hasOwnProperty('cost')) {
							entry.cost = catalog[d.type].cost;
						}
						
						if (d.hasOwnProperty('removable')) {
							entry.removable = d.removable;	
						}
						
						if (d.hasOwnProperty('draggable')) {
							entry.draggable = d.draggable;	
						}
						
						if (d.properties) {
							entry.properties = d.properties;
						}
		
						state.push(entry);
					
					}
				
				});
				
				serialized.push(state);
			
			});
		
		}
		
		//console.log(data);
		window.parent.postMessage({ message: 'userData', data: JSON.stringify(serialized), instanceId: instanceId }, '*');
	
	}

}

Canvas.zoomToVisible = function() {
	var me = this;
	var boundary = me.boundary;
	var features = me.features;
	var state = me.getState();
	var userdata = me.userdata[state];
	
	if (boundary) {
		me.fitBounds(boundary);
	} else if (features) {
		var bounds = $.map(features, function(d) {
			return d.getLatLng();					  
		});
		me.fitBounds(bounds);
	} else if (userdata) {
		var bounds = $.map(userdata, function(d) {
			return d.latlng;					  
		});
		me.fitBounds(bounds);
	}
}
	
Canvas.on('click', function (e) {
	var me = this;
	me.clickCanvas(e);
});

Canvas.on('popupopen', function (e) {
	$('body').addClass('leaflet-popup-open');
});

Canvas.on('popupclose', function (e) {
	$('body').removeClass('leaflet-popup-open');
});

$(document).on('click', '[data-action="zoom-in"]', function(e) {
	Canvas.zoomIn();																
});

$(document).on('click', '[data-action="zoom-out"]', function(e) {
	Canvas.zoomOut();																
});

$(document).on('click', '[data-action="zoom-fit"]', function(e) {
	Canvas.zoomToVisible();																	
});

$(document).on('click', '[data-action="state-prev"]', function(e) {
	Canvas.setState(Canvas.getState() - 1);																	
});

$(document).on('click', '[data-action="state-next"]', function(e) {
	Canvas.setState(Canvas.getState() + 1);																	
});

$(document).keyup(function(e) {						   
	var modalOpen = $('body').hasClass('modal-open');
	if (e.keyCode == 27 && !modalOpen) {
		Canvas.setActive();
		Canvas.update();
	}
});

window.addEventListener('message', function(postmessage) {		
	if (postmessage.data.message == 'mapData' && postmessage.data.instanceId) {
		Canvas.init(postmessage.data);	
	}
	if (postmessage.data.message == 'getUserData' && postmessage.data.instanceId) {
		Canvas.serialize(postmessage.data);
	}
});
