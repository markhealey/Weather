F2.Apps["com_mark_weather"] = (function() {

	var App_Class = function(appConfig, appContent, root) {
		this.appConfig = appConfig;
		this.appContent = appContent;
		this.ui = appConfig.ui;
		this.$root = $(root);
		
		this.APP_PATH = './weather/';
		this.API_KEY = 'a52516cc842034586d546cfe2459f02a';
		this.API_ENDPOINT = 'https://api.forecast.io/forecast/' + this.API_KEY + '/';
		this.CACHE_KEY = 'com_mark_weather';
		this.ROTATION_TIME = moment.duration(15, 'seconds').asMilliseconds();//between curr temp & details
		this.AUTO_REFRESH = true; //fetch new data every...
		this.AUTO_REFRESH_TIME = moment.duration(5, 'minutes').asMilliseconds();
		this.MOD_LAT_LON = [40.014986 , -105.270546]; //http://www.latlong.net/
		this.PROJECTOR = true;
	};

	App_Class.prototype.init = function() {
		delete localStorage.weatherapp;
		console.log('Weather init...');
		this.ui.setTitle('Local Weather');
		this.ui.showMask(this.$root,true);
		if (this.PROJECTOR){
			$('div.appBody', this.$root).addClass('projector');
		}
		this._getLocation();
	};

	App_Class.prototype._getLocation = function() {

		//just hard-code boulder for now...
		this._getLocationSuccess(this._getModLatLon());
		return;

		//this code will use geolocation
		var oCache = this.localStorage(this.CACHE_KEY);
		if (oCache != null && moment().isBefore(oCache.expires)){
			this._getLocationSuccess(oCache.geoposition);
		} else {
			//get current location
			navigator.geolocation.getCurrentPosition(
				$.proxy(this._getLocationSuccess,this),
				$.proxy(this._getLocationError,this)
			);
		}
	};

	App_Class.prototype._getModLatLon = function() {
		return {
			timestamp: new Date().getTime(),
			coords: {
				latitude: this.MOD_LAT_LON[0],
				longitude: this.MOD_LAT_LON[1]
			}
		};
	};

	App_Class.prototype._getLocationSuccess = function(geoposition) {
		this.geoposition = geoposition;
		
		this._updateCache(this.CACHE_KEY, {geoposition: geoposition});

		$.when( 
			this.getForecast(), 
			this.getTemplate() 
		).then( 
			$.proxy(this.render,this), 
			$.proxy(this.renderFailed,this) 
		);
	};

	App_Class.prototype._getLocationError = function() {
		throw('geolocation error or not supported', arguments);
	};

	App_Class.prototype.render = function(forecast, template) {
		//console.log('render',forecast,template);

		//fix up some data real quick
		forecast[0] = this.hydrateForecast(forecast[0]) || {};
		
		//mustache it
		var html = Mustache.to_html(template[0], forecast[0]);

		//append it
		$('div.appBody',this.$root).html(html);

		if (forecast[0].hasAlerts){
			this.handleWxAlerts(forecast[0]);
		}

		this.getFlickr();
		
		//hide loader, update height per F2 spec
		this.ui.hideMask(this.$root);
		this.ui.updateHeight();

		//auto-refresh every N ?
		if (this.AUTO_REFRESH){
			window.clearTimeout(this.refresher);
			this.refresher = window.setTimeout($.proxy(function(){
				this.init();
			},this), this.AUTO_REFRESH_TIME);
		}

		//start rotation between curr temp and details
		this.rotateRightnow();
	};

	App_Class.prototype.renderFailed = function() {
		console.error('render FAIL', arguments);
	};

	App_Class.prototype.getTemplate = function() {
		//return $.get(this.APP_PATH + 'app.mustache');
		var deferred = new $.Deferred().resolve([this._TEMPLATE()]);//needs to be an array b/c thats what $.when() returns
		return deferred.promise();
	};

	App_Class.prototype.getForecast = function() {

		var oCache = this.localStorage(this.CACHE_KEY);

		//if we have cached data, return it as part of a Deferred (simulating jqXHR)
		if (oCache != null && oCache.forecast && moment().isBefore(oCache.expires)){
			var deferred = new $.Deferred().resolve([oCache.forecast]);//needs to be an array b/c thats what $.when() returns
			return deferred.promise();
		}

		var coords 		= this.localStorage(this.CACHE_KEY).geoposition.coords,
			api 		= this.API_ENDPOINT + coords.latitude + ',' + coords.longitude + '/?callback=?',
			cacheResult = $.proxy(function(data){
			this.localStorage(this.CACHE_KEY,{
				expires: 		this.getCacheExpirationTime(1),
				geoposition: 	this.geoposition,
				forecast: 		data
			});
		},this);

		//return deferred
		return $.getJSON(api).done(cacheResult);
	};

	App_Class.prototype.handleWxAlerts = function(forecast) {
		var $div = $('div.alerts', this.$root),
		 	$lists = $div.find('li')
		 ;

		 $lists.hide().addClass('hide');
		 $lists.eq(0).show(function(){
		 	$(this).removeClass('hide');
		 });

		 if ($lists.length > 1){

		 }
	};

	App_Class.prototype.hydrateForecast = function(forecast) {
		if (!forecast){ return forecast; }

		//a little data massaging
		forecast.appPath 				= this.APP_PATH;
		forecast.currently.temperature 	= parseInt(forecast.currently.temperature);
		forecast.currently.humidity 	= parseInt(forecast.currently.humidity * 100);
		forecast.currently.windSpeed 	= parseInt(forecast.currently.windSpeed);
		forecast.currently.visibility 	= parseInt(forecast.currently.visibility);
		forecast.currently.pressure		= parseInt(forecast.currently.pressure);

		if (forecast.alerts && forecast.alerts.length){
			forecast.hasAlerts = true;
		}

		return forecast;
	};

	//EH!
	App_Class.prototype.rotateRightnow = function() {
		var _this = this;
		window.clearTimeout(this.rotate);
		this.rotate = window.setTimeout(function(){
			var $tmp = $('div.temp', this.$root),
				$detail = $('div.detail', this.$root);

			if ($detail.hasClass('hide')){
				$tmp.fadeOut('normal', function(){
					$detail.fadeIn('normal', function(){
						$detail.removeClass('hide');
						_this.rotateRightnow();
					});
				});
			} else {
				$detail.fadeOut('normal', function(){
					$detail.addClass('hide');
					$tmp.fadeIn('normal',function(){
						_this.rotateRightnow();
					});
				});
			}
		},this.ROTATION_TIME);
	};

	//utils
	App_Class.prototype.localStorage = function(key,val) {
		if (!key && !val){
			throw ('Neither a key or a value were provided.');
		} else {
			if (val === 'undefined' || val === undefined){
				return $.totalStorage(key);
			} else {
				$.totalStorage(key,val);
				return val;
			}
		}
	};

	App_Class.prototype.getFlickr = function() {
		
		var FLICKR_API = 'http://api.flickr.com/services/rest/',
		API_KEY = '82540fa18d4de0936078b916cbd668de',
		_ajax = function(method,inputs){
			inputs = $.extend({},inputs,{
				method: method,
				api_key: API_KEY,
				format: 'json'
			});
			return $a = $.ajax({
				url: FLICKR_API,
				data: inputs,
				dataType: 'jsonp',
				jsonpCallback: 'jsonFlickrApi'
			});
		},
		self = this;

		var getGroupPhotos = function(){
			return _ajax('flickr.photos.search',{
				safe_search: 	1,
				content_type: 	1,
				group_id: 		'1579929@N25' //I Love Boulder
				//woe_id: 		'2367231',
				//place_id: 	'j3ThSq1TUbz4jf.U',
				//lat: 			'40.015',
				//lon: 			'-105.279',
				//accuracy: 	6,
				//,per_page: 	1
			});

		}

		var getPhoto = function(data){
			var rand = data.photos.photo[Math.floor(Math.random() * data.photos.photo.length)];

			return _ajax('flickr.photos.getSizes',{
				photo_id: rand.id
			})
			.done(function(resp){

				var sizes = resp.sizes.size;

				//loop over all sizes and extract large one...
				for (var i = 0, src; i < sizes.length; i++) {
					if (sizes[i].label == 'Large' && sizes[i].source != null){
						src = sizes[i].source;
						break;
					}
				};

				//preload
				var $img = $('<img src="'+src+'" class="bg hide">');
				$img.insertBefore($('section:first',self.$root));

				$img.load(function(){
					var $newImg = $('img.bg',self.$root),
					$body = $('div.appBody > section',self.$root);

					$newImg.fadeIn();

					if ($newImg.height() > $body.outerHeight()){
						$body.css('height',$newImg.height());
					}

					var bottom = $newImg.position().top + $newImg.height(); //find bottom of photo
					var gradientStart = parseInt( (bottom / $body.height()) * 100 );//find bottom of photo in % from top
					var gradientEnd = 71; //nice magic #

					if (gradientStart <= (gradientEnd + 10)){ //gradientEnd + 10 is a buffer so we don't end up with hard edges in close scenarios
						gradientEnd = gradientStart - 29;
					}

					$body.css('background','linear-gradient(to bottom, rgba(0,0,0,0) 0%,rgba(0,0,0,0) '+gradientEnd+'%,rgba(0,0,0,1) '+gradientStart+'%)');

				});

				getUserInfo(rand.owner);
			})
		}

		var getUserInfo = function(NSId){

			return _ajax('flickr.people.getInfo',{
				user_id: NSId
			})
			.done(function(resp){
				//console.log('getUsername AJAX',resp)
				var user = resp.person.username._content;
				$('footer',self.$root).append(' / photo by ' + user + ' on <strong>flickr</strong>');
			})
		}

		console.log('Loading flickr background image...')
		$.when( getGroupPhotos() ).then( getPhoto );
	};

	App_Class.prototype._TEMPLATE = function() {
		return [
			'<section>',
				'<div class="rightnow">',
					'<section class="wxicon {{currently.icon}}">',
						'<h1>Right Now</h1>',
						'<div class="temp">',
							'<h2>{{currently.temperature}}&deg;</h2>',
							'<div class="conditions">{{currently.summary}}</div>',
						'</div>',
						'<div class="detail hide">',
							'<table class="table table-condensed">',
								'<tbody>',
									'<tr>',
										'<th>Humidity:</th>',
										'<td>{{currently.humidity}}%</td>',
									'</tr>',
									'<tr>',
										'<th>Pressure:</th>',
										'<td>{{currently.pressure}} mb</td>',
									'</tr>',
									'<tr>',
										'<th>Wind:</th>',
										'<td>{{currently.windSpeed}} mph</td>',
									'</tr>',
									'<tr>',
										'<th>Visibility:</th>',
										'<td>{{currently.visibility}} mi</td>',
									'</tr>',
								'</tbody>',
							'</table>',
						'</div>',
					'</section>',
				'</div>',
				'{{#hasAlerts}}',
				'<div class="alerts">',
					'<ul class="unstyled">',
				'{{/hasAlerts}}',
					'{{#alerts}}',
						'<li>{{title}}</li>',
					'{{/alerts}}',
				'{{#hasAlerts}}',
					'</ul>',
				'</div>',
				'{{/hasAlerts}}',
				'<div class="media clearfix">',
					'<a class="pull-left" href="#"><img class="media-object" src="{{appPath}}icons/{{hourly.icon}}.png" width="70"></a>',
					'<div class="media-body">',
						'<h4 class="media-heading">LATER</h4>',
						'{{hourly.summary}}',
					'</div>',
				'</div>',
				'<div class="media clearfix">',
					'<a class="pull-left" href="#"><img class="media-object" src="{{appPath}}icons/{{daily.icon}}.png" width="70"></a>',
					'<div class="media-body">',
						'<h4 class="media-heading">THIS WEEK</h4>',
						'{{daily.summary}}',
					'</div>',
				'</div>',
				'<footer>Data by forecast.io</footer>',
			'</section>'
		].join('');
	};

	//update an existing cached object using $.extend. 
	//@val = {} to be merged with existing cache
	App_Class.prototype._updateCache = function(key,val) {
		var currCache = this.localStorage(key);
		this.localStorage(key, $.extend(currCache,val));
	};

	App_Class.prototype.getCacheExpirationTime = function(timeInMinutes) {
		timeInMinutes = timeInMinutes || 1;
		return moment().add('m', timeInMinutes).valueOf(); //1 mins, in unix offset 
	};

	return App_Class;

})();