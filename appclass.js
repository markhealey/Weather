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
		$('div.appBody',this.$root).html(html).data('forecast',forecast[0]);

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
				//group_id: 		'1579929@N25' //I Love Boulder
				group_id: 		'54342054@N00' //Boulder, Colo group
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
				console.log('getPhoto',resp)

				if (resp.stat == 'fail'){
					return;
				}

				var sizes = resp.sizes.size;

				//loop over all sizes and extract large one...
				for (var i = 0, src; i < sizes.length; i++) {
					if (sizes[i].label == 'Medium' && sizes[i].source != null){
						src = sizes[i].source;
						break;
					}
				};

				placePhoto(src);
				getUserInfo(rand.owner);
			})
		}

		var placePhoto = function(src){
			var $img = $('<img src="'+src+'" class="bg hide">');//preload
			$img.insertBefore($('section:first',self.$root));

			$img.load(function(){
				var $newImg = $('img.bg',self.$root),
					$body = $('div.appBody > section',self.$root),
					imgHeight = $newImg.height(),
					bodyHeight = $body.outerHeight();

				$newImg.fadeIn();

				if (imgHeight > bodyHeight){
					$body.css('height',imgHeight);
				}

				var bottom = $newImg.position().top + imgHeight; //find bottom of photo
				var gradientStart = parseInt( (bottom / bodyHeight) * 100 );//find bottom of photo in % from top
				var GRADIENT_END = 71; //nice magic #
				var HEIGHT_OF_GRADIENT = 29;

				if (gradientStart <= (GRADIENT_END + 10)){ //GRADIENT_END + 10 is a buffer so we don't end up with hard edges in close scenarios
					GRADIENT_END = gradientStart - HEIGHT_OF_GRADIENT;
				}

				$body.css('background','linear-gradient(to bottom, rgba(0,0,0,0) 0%,rgba(0,0,0,0) '+GRADIENT_END+'%,rgba(0,0,0,1) '+gradientStart+'%)');

			});
		}

		var getUserInfo = function(NSId){

			return _ajax('flickr.people.getInfo',{
				user_id: NSId
			})
			.done(function(resp){
				console.log('getUsername AJAX',NSId,resp)
				try {
					var user = resp.person.username._content;
				} catch(e){
					console.error('getUsername',e);
					var user = NSId;
				}
				$('footer',self.$root).append(' / photo by ' + user + ' on <strong>flickr</strong>');
			})
		}

		var getPhotoFromCurrentConditions = function(){
			var forecast = $('div.appBody',self.$root).data('forecast');
			
			console.log('getPhotoFromCurrentConditions',forecast);
			
			var currentIcon = forecast.currently.icon,
				images = self.PHOTOS,
				data = {
					photos: {
						photo: []
					}
				},
				deferred = new $.Deferred()
			;

			currentIcon = 'snow';

			console.warn(currentIcon);

			if (images[currentIcon]){
				data.photos.photo = images[currentIcon];
			} else {
				return getGroupPhotos();
			}

			console.log(data)

			deferred.resolve(data);
			return deferred.promise();
		}		

		/** 
		 * Start chain of deferreds...
		 *
		 */
		console.log('Loading flickr background image...')
		//$.when( getGroupPhotos() ).then( getPhoto );
		$.when( getPhotoFromCurrentConditions() ).then( getPhoto );
	};

	App_Class.prototype.PHOTOS = {
		'snow': [
			//'http://farm9.staticflickr.com/8110/8638376925_1b96dce9bb.jpg' //http://www.flickr.com/photos/cmoscolors/8638376925/
			{
				id: '8638376925',
				owner: 'cmoscolors'
			}
		],
		'partly-cloudy-day': [
			{
				id: '8203547388', //http://www.flickr.com/photos/whltexbread/8203547388/in/pool-54342054@N00/
				owner: 'whltexbread'
			}
		],
		'rain': [
			{
				id: '7711392756',//http://www.flickr.com/photos/8225741@N07/7711392756/in/pool-54342054@N00/
				owner: '8225741@N07'
			},
			{
				id: '6292925110', //http://www.flickr.com/photos/wickedlilac/6292925110/in/pool-54342054@N00/
				owner: 'wickedlilac'
			}
		]
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