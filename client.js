	// Set to true when the creative has finished loading.
	// If it is still false when we try to log a playlog, it will not be logged,
	// as it was not a valid play since the media had not loaded properly.
	var loadedProperly = false;

	// Keeps track of the ad currently playing for playlog purposes.
	var adToPlay;

	// Manage the queue of upcoming plays
	var adsQueue = [];
	var currentlyRequestingAd = false;
	var currentlyPlaying = false;
	var currentlyPlayingFallback = false;

	// Indicates if the app is running as a Chrome OS app
	var chromeAppMode = false;
	if (chrome.storage)
	{
		chromeAppMode = true;
	}

	// Chrome local storage is async. Load it all at app start and then work with this in-memory object.
	var chromeAppLocalStorageObject = {};

	// ----------------------------------------------
	//    Settings initialized from local storage
	// ----------------------------------------------

	// Show / hide the red Diagnostics box at the top-left of the page. Useful for debugging.
	var DEBUG_ShowDiagnostics;
	var hivestackUrl;

	// Controls whether a black spot or a fallback / placeholder creative should be played if Hivestack says there is nothing to play
	// The Fallback Image URL can be a web URL, a local file, or a data URI (ex: data:image/png;base64,/9j/4AAQSkZJRgABAQEASABIAAD...)
	var useFallback;
	var fallbackCreativeUrl;
	var fallbackDurationSeconds;

	// UUID of the screen this app controls. Refer to the Ad Server to obtain it.
	var screenUUID;

	var multiscreenMode;
	var multiscreenUUIDs;

	// Controls whether to play the ad (start video, count impressions, etc) as soon as the file is ready, or wait for the runtime to call the play() function
	var autoPlay;

	// Controls whether to play the creative from local content folder or download the file from url
	var offlineOnly;
	var contentFolderName;

	// Format of the file that contains the player'd ID. Can be 'xml' (location.xml) or 'js' (screenid.js)
	var locationFileFormat;

	// ----------------------------------------------
	//    End of settings
	// ----------------------------------------------

	// Can also be called by Player when it is time to play the ad. You can call 'play()' in the browser's javascript console to test this behavior.
	// the call to logPlay() can also be done separately by the player, if it can confirm that the creative has done playing
	function play() 
	{
		$('#myVideo')[0].play();
		setTimeout(spotOver, adToPlay.duration * 1000);
		debugWrite('The ad is playing for ' + adToPlay.duration + ' seconds.');
		logPlay();
	}

	// Called by Player when if it needs to pause the ad (interrupts for example). You can call 'pause()' in the browser's javascript console to test this behavior.
	function pause() 
	{
		$('#myVideo')[0].pause();
		debugWrite('The ad is paused.');
	}

	function spotOver() 
	{
		debugWrite("Done playing this ad");
		currentlyPlaying = false;
		playSpot();
	}

	// Called when the image / video has finished loading.  We assume that the ad has played if the creative has been loaded properly
	function mediaFinishedLoading()
	{
		debugWrite('Finished loading ' + this.src);
		loadedProperly = true;
		if (autoPlay == true) {
			play();
		}
	}

	// Helper debug function
	function debugWrite(message)
	{
		$('#debug-text').html($('#debug-text').html() + '<p style="margin: 2px 0px 2px 0px">' + " - " + message + '</p>');
		if ($('#debug-text').children().length > 30)
		{
			$('#debug-text').children()[1].remove()
		}
	}

	function saveLocalDataHtml(key, value)
	{
		localStorage.setItem(key, value);
	}

	function saveLocalDataChrome(keyvaluepairs, callback)
	{
		chrome.storage.local.set(keyvaluepairs, callback);
	}

	function loadLocalData(key, value)
	{
		if (chromeAppMode == true)
		{
			return chromeAppLocalStorageObject[key]
		}
		else
		{
			return localStorage.getItem(key);
		}
	}

	function clearLocalData(callback)
	{
		if (chromeAppMode == true)
		{
			chrome.storage.local.clear(callback);
		}
		else
		{
			localStorage.clear();
			callback();
		}
	}

	function reloadApp()
	{
		if (chromeAppMode == true)
		{
			chrome.runtime.reload();
		}
		else
		{
			window.location.reload();
		}
	}

	function fillChromeAppLocalStorageObject(callback)
	{
		chrome.storage.local.get(null, function(data) {
			chromeAppLocalStorageObject = data;
			callback();
		});
	}

	// Called when Player orders the ad to play. Will record a playlog only if the creative has been loaded properly.
	function logPlay()
	{
		if (adToPlay != null && currentlyPlayingFallback == false)
		{
			if (loadedProperly == true)
			{
				var reportUrls = []

				if (multiscreenMode)
				{
				    multiscreenUUIDs.forEach(function(x)
					{
                        reportUrls.push(adToPlay.reportUrl.replace('[unit_id]', x))
                    })
				}
				else
				{
				    reportUrls.push(adToPlay.reportUrl)
				}

                reportUrls.forEach(function(reportUrl)
				{
					$.ajax(
					{
						method: "GET",
						url: reportUrl,
						success: function(data)
						{
							debugWrite('Logged a playlog for ' + adToPlay.creative_url);
						},
						error: function(data)
						{
							debugWrite('FAILED to log a playlog for ' + adToPlay.creative_url + ". Error: " + data.status + " - " + data.statusText + '(' + data.responseText + ')');
						}
					})
				});
			}
			else
			{
				debugWrite('Tried to log a playlog for an ad that did not load properly: ' + adToPlay.creative_url);
			}
		}
		else
		{
			// debugWrite('Tried to log a playlog for a skipped ad');
		}
	}

	// Starting point, called when page is ready
	function main()
	{
		setInterval(function() { $('#queueDepth').text(adsQueue.length) }, 100);

		$('html').on('dblclick', function() {
			$('#settings').show();
		});

		$('#settingsSave').on('click', function() {
			if (!$('#adServerUrl').val() || !$('#screenUUID').val() || !$('#fallbackDurationSeconds').val())
			{
				$('#settingsError').show();
			}
			else
			{
				if (chromeAppMode == true)
				{
					saveLocalDataChrome(
						{
							"DEBUG_ShowDiagnostics": $('#DEBUG_ShowDiagnostics').prop('checked').toString(),
							"hivestackUrl": $('#adServerUrl').val(),
							"screenUUID": $('#screenUUID').val(),
							"useFallback": "true",
							"fallbackCreativeUrl": "hivestack-fallback-logo.png",
							"fallbackDurationSeconds": $('#fallbackDurationSeconds').val()
						}, reloadApp);
				}
				else
				{
					saveLocalDataHtml("DEBUG_ShowDiagnostics", $('#DEBUG_ShowDiagnostics').prop('checked'));
					saveLocalDataHtml("hivestackUrl", $('#adServerUrl').val());
					saveLocalDataHtml("screenUUID", $('#screenUUID').val());

					saveLocalDataHtml("useFallback", "true");
					saveLocalDataHtml("fallbackCreativeUrl", "hivestack-fallback-logo.png");
					saveLocalDataHtml("fallbackDurationSeconds", $('#fallbackDurationSeconds').val());
					
					reloadApp();
				}

			}
		});

		$('#settingsClear').on('click', function() {
			clearLocalData(reloadApp);
		});

        $('#settingsClose').on('click', function() {
            $('#settings').hide();
        });

		if (!loadLocalData("screenUUID"))
		{
			$('#settings').show();
			$('#debug-container').hide();
		}
		else
		{
			DEBUG_ShowDiagnostics = loadLocalData("DEBUG_ShowDiagnostics") == 'true';
			hivestackUrl = loadLocalData("hivestackUrl");
			screenUUID = loadLocalData("screenUUID");

			useFallback = loadLocalData("useFallback") == 'true';
			fallbackCreativeUrl = loadLocalData("fallbackCreativeUrl");
			fallbackDurationSeconds = parseFloat(loadLocalData("fallbackDurationSeconds"));

			multiscreenMode = false;
			multiscreenUUIDs = [];

			autoPlay = true;
			offlineOnly = false;
			contentFolderName = ""
			locationFileFormat = "js";

			// Fill the settings screen with the loaded values
			$('#adServerUrl').val(hivestackUrl);
			$('#screenUUID').val(screenUUID);
			$('#fallbackDurationSeconds').val(fallbackDurationSeconds);
			$('#DEBUG_ShowDiagnostics').prop('checked', DEBUG_ShowDiagnostics);

			hivestackUrl = hivestackUrl + "/nirvana/api/v1";

			// Shows the debug infos area if in debug mode
			if (DEBUG_ShowDiagnostics) 
			{
				$('#debug-container').show();
			}

			var img = $('#myImage');
			var vid = $('#myVideo');
			img.on('load', mediaFinishedLoading);
	        vid.on('canplay', mediaFinishedLoading);
			img.on('error', function() { skipSpot(2); });
			vid.on('error', function() { skipSpot(2); });

			if (screenUUID == null)
			{
				loadLocationFile();
			}
			else
			{
				initPlay();
			}
		}
	}

	// Loads the Screen UUID from the xml file
	function loadLocationFile()
	{
	    if (locationFileFormat == 'xml') {
            $.ajax(
                {
                    url: "formal_location.xml",
                    success: afterLoadLocationFile,
                    dataType: "text",
                    error: function (data) {
                        document.title = 'skip:Error loading location file';
                        debugWrite('Error loading location file: ' + data.statusText);
                    }
                });
        }
        else if (locationFileFormat == 'js')
		{
            var head = document.getElementsByTagName('head')[0];
            var script = document.createElement('script');

            script.type = 'text/javascript';
            script.src = "screenid.js";
            script.onload = initPlay;

            head.appendChild(script);
		}
		else
		{
            debugWrite('Invalid locationFileFormat');
		}
	}

	// Parses the Screen UUID from the loaded xml file
	function afterLoadLocationFile(xmlString)
	{
		screenUUID = xmlString.match(/<FaceID>(.*)<\/FaceID>/)[1];
		if (screenUUID == null)
		{
			debugWrite('Error reading screen data from Location File');
		}
		else
		{
			debugWrite('Screen UUID: ' + screenUUID);
		}
		initPlay();
	}

	function requestAd()
	{
		if (adsQueue.length < 2 && currentlyRequestingAd == false)
		{
			debugWrite('Requesting an ad.');
			currentlyRequestingAd = true;
			var scheduleUrl = hivestackUrl + '/units/' + screenUUID + '/schedulevast';
	        var postData = {};
	        var method = "GET";

	        if (multiscreenMode)
	        {
	            postData['unit_uuids'] = multiscreenUUIDs;
	            scheduleUrl = hivestackUrl + '/units/' + multiscreenUUIDs[0] + '/schedulevast';
	            method = "POST";
	        }

			$.ajax(
			{
				method: method,
				url: scheduleUrl,
				data: JSON.stringify(postData),
				success: function(data)
				{
					currentlyRequestingAd = false;

					if (data != null)
					{
					    if (typeof(data) == 'string')
						{
						    data = $.parseXML(data)
						}
					    
				        impressionNode = data.getElementsByTagName("Impression")
                        mediafileNode = data.getElementsByTagName("MediaFile")
                        durationNode = data.getElementsByTagName("Duration")
						if (impressionNode.length == 0 || mediafileNode.length == 0 || durationNode.length == 0)
						{
                            debugWrite('Ad Server replied that there was nothing to play.');
                            skipSpot(3);
                            return;
						}

                        reportUrl = impressionNode[0].childNodes[1].nodeValue.trim()
                        creativeCompleteUrl = mediafileNode[0].childNodes[1].nodeValue.trim()
                        format = mediafileNode[0].getAttributeNode('type').nodeValue.trim()
                        durationString = durationNode[0].childNodes[0].nodeValue.trim().split(':');
                        duration = durationString[0] * 3600 + durationString[1] * 60 + durationString[2] * 1;

						if (offlineOnly)
						{
							var creativeName = data.creative_url.substring(data.creative_url.lastIndexOf('.net') + 5, data.creative_url.lastIndexOf('/'))
							var creativeExtension =  data.creative_url.substring(data.creative_url.lastIndexOf('.'))
							creativeCompleteUrl = getOfflineCreative(creativeName + creativeExtension)
							debugWrite(creativeCompleteUrl)
						}

						var spotFormatted =
						{
							creative_url: creativeCompleteUrl,
							format: format,
	                        reportUrl: reportUrl,
	                        duration: duration,
	                        isFallback: false
						}

						debugWrite('Successfully received an ad from Hivestack');
						adsQueue.push(spotFormatted)
						if (currentlyPlaying == false)
						{
							playSpot();
						}
					}
					else
					{
						debugWrite('Tried to refresh but Hivestack said there was nothing to play.');
						skipSpot(3);
						return;
					}
				},
				error: function(data)
				{
					currentlyRequestingAd = false;
					document.title = 'skip:Error loading schedule from Hivestack';
					debugWrite('Error loading schedule from Hivestack. Error: ' + data.status + " - " + data.statusText + '(' + data.responseText + ')');
					skipSpot(4);
				}
			});
		}
	}

	// Gets a play from the ad server and plays it
	function initPlay()
	{
		setInterval(requestAd, 1000);
	}

	function playSpot()
	{
		if (currentlyPlaying == false)
		{
            debugWrite('Checking queue, length is ' + adsQueue.length);
            if (adsQueue.length != 0)
            {
                currentlyPlaying = true;
                adToPlay = adsQueue.splice(0, 1)[0];
                currentlyPlayingFallback = adToPlay.isFallback;
                document.title = 'play';
                prepareFileForPlay(adToPlay.creative_url, adToPlay.format);
            }
            else
			{
                // Unexpected state encountered. Try again after a small delay
                debugWrite('Queue was unexpectedly empty. Will re-attempt playing once a new ad is loaded');
                setTimeout(playSpot, 3000)
            }
        }
	}

	// Either plays a fallback image or orders the player to skip it this ad altogether
	function skipSpot(code)
	{
	    // code 1 means we got a load error upon loading the fallback. Dont re-attempt.
		if(code == 1)
		{
			return;
		}

		var spotFormatted =
		{
			creative_url: fallbackCreativeUrl,
			format: null,
            reportUrl: null,
            duration: fallbackDurationSeconds,
            isFallback: true
		};

		adsQueue.push(spotFormatted);

		if (currentlyPlaying == false)
		{
			playSpot();
		}
	}

	// Setups a creative based on its mimetype or extension
	function prepareFileForPlay(filename, mimetype) {
		var creativeExtension;

		if (mimetype != null)
		{
			var splitMimetype = mimetype.split('/');
			creativeExtension = splitMimetype[splitMimetype.length - 1].toLowerCase();
		}
		else
		{
			var splitFilename = filename.split('.');
			creativeExtension = splitFilename[splitFilename.length - 1].toLowerCase();
		}

		var img = $('#myImage');
		var vid = $('#myVideo');

		switch (creativeExtension)
		{
			case 'jpg':
			case 'jpeg':
			case 'png':
			case 'gif':
			case 'bmp':
			case 'svg':
				loadImage(img, vid, filename);
				break;

			case 'mp4':
			case 'mov':
			case 'webm':
			case 'avi':
			case 'wmv':
				vid.attr('src', filename);
				vid.css('display', 'inline');
				img.css('display', 'none');
				break;
			default:
				//No extension: assume it's an image
				loadImage(img, vid, filename);
				break;
		}
	}

function loadImage(img, vid, filename)
{	
	// For now, Chrome App mode doesn't support external images. When asked to play an image, play the fallback
	if (chromeAppMode == true)
	{
        var xhr = new XMLHttpRequest();
        xhr.open('GET', filename, true);
        xhr.responseType = 'blob';
        xhr.onload = function(e) {
            img.attr('src', window.URL.createObjectURL(this.response));
            img.css('display', 'inline');
            vid.css('display', 'none');
        };
        xhr.onerror = function(e) {
        	debugWrite("Error loading image " + filename + ". Playing fallback");
            img.attr('src', fallbackCreativeUrl);
            img.css('display', 'inline');
            vid.css('display', 'none');
		};

        xhr.send();
	}
	else 
	{
		img.attr('src', filename);
		img.css('display', 'inline');
		vid.css('display', 'none');
	}
}

// Format a javascript data to an ISO 8601 date
function formatLocalDate(now) {
	var tzo = -now.getTimezoneOffset(),
		dif = tzo >= 0 ? '+' : '-',
		pad = function(num) {
			var norm = Math.abs(Math.floor(num));
			return (norm < 10 ? '0' : '') + norm;
		};
	return now.getFullYear()
		+ '-' + pad(now.getMonth()+1)
		+ '-' + pad(now.getDate())
		+ 'T' + pad(now.getHours())
		+ ':' + pad(now.getMinutes())
		+ ':' + pad(now.getSeconds())
		+ dif + pad(tzo / 60)
		+ ':' + pad(tzo % 60);
}

function getOfflineCreative(creativeNameWithExtension)
{
	var loc = window.location.pathname;
	var currentDirectory = loc.substring(0, loc.lastIndexOf('/'));
	return 'file://' + currentDirectory + '/'+ contentFolderName + '/' + creativeNameWithExtension
}

// Starts the whole thing!
if (chromeAppMode == true)
{
	fillChromeAppLocalStorageObject(main);
}
else
{
	main();
}