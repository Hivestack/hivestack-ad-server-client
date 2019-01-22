	// Keeps track of the ad currently playing for playlog purposes.
	var adToPlay;

	// Manage the queue of upcoming plays
	var adsQueue = [];
	var currentlyRequestingAd = false;
	var currentlyPlaying = false;

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

	// Controls whether to play the creative from local content folder or download the file from url
	var offlineOnly;
	var contentFolderName;

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
		play();
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
		if (adToPlay != null && adToPlay.isFallback == false)
		{
			$.ajax(
			{
				method: "GET",
				url: adToPlay.reportUrl,
				success: function(data)
				{
					debugWrite('Logged a playlog for ' + adToPlay.creative_url);
				},
				error: function(data)
				{
					debugWrite('Failed to log a playlog for ' + adToPlay.creative_url + ". Error: " + data.status + " - " + data.statusText + '(' + data.responseText + ')');
				}
			})
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

			offlineOnly = false;
			contentFolderName = "";
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
			img.on('error', function() { skipSpot(); });
			vid.on('error', function() { skipSpot(); });

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

	// Loads the Screen UUID from the screenid.js file
	function loadLocationFile()
	{
		var head = document.getElementsByTagName('head')[0];
		var script = document.createElement('script');

		script.type = 'text/javascript';
		script.src = "screenid.js";
		script.onload = initPlay;

		head.appendChild(script);
	}

	function requestAd()
	{
		if (adsQueue.length < 2 && currentlyRequestingAd == false)
		{
			debugWrite('Requesting an ad.');
			currentlyRequestingAd = true;

			$.ajax(
			{
				method: "GET",
				url: hivestackUrl + '/units/' + screenUUID + '/schedulevast',
				success: function(data)
				{
					currentlyRequestingAd = false;

					if (data != null)
					{
					    if (typeof(data) == 'string')
						{
						    data = $.parseXML(data)
						}
					    
				        impressionNode = data.getElementsByTagName("Impression");
                        mediafileNode = data.getElementsByTagName("MediaFile");
                        durationNode = data.getElementsByTagName("Duration");
						if (impressionNode.length == 0 || mediafileNode.length == 0 || durationNode.length == 0)
						{
                            debugWrite('Improperly formatted ad server response. Skipping spot.');
                            skipSpot();
                            return;
						}

                        reportUrl = impressionNode[0].childNodes[1].nodeValue.trim();
                        creativeCompleteUrl = mediafileNode[0].childNodes[1].nodeValue.trim();
                        format = mediafileNode[0].getAttributeNode('type').nodeValue.trim();
                        durationString = durationNode[0].childNodes[0].nodeValue.trim().split(':');
                        duration = durationString[0] * 3600 + durationString[1] * 60 + durationString[2] * 1;

						if (offlineOnly)
						{
							var creativeName = data.creative_url.substring(data.creative_url.lastIndexOf('.net') + 5, data.creative_url.lastIndexOf('/'));
							var creativeExtension =  data.creative_url.substring(data.creative_url.lastIndexOf('.'));
							creativeCompleteUrl = getOfflineCreative(creativeName + creativeExtension);
							debugWrite(creativeCompleteUrl)
						}

						var spotFormatted =
						{
							creative_url: creativeCompleteUrl,
							format: format,
	                        reportUrl: reportUrl,
	                        duration: duration,
	                        isFallback: false
						};

						debugWrite('Successfully received an ad from Hivestack');
						adsQueue.push(spotFormatted);
						if (currentlyPlaying == false)
						{
							playSpot();
						}
					}
					else
					{
						debugWrite('Tried to refresh but Hivestack said there was nothing to play.');
						skipSpot();
					}
				},
				error: function(data)
				{
					currentlyRequestingAd = false;
					debugWrite('Error loading schedule from Hivestack. Error: ' + data.status + " - " + data.statusText + '(' + data.responseText + ')');
					skipSpot();
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
	function skipSpot()
	{
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
	// Chrome Apps require a workaround to load external images
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