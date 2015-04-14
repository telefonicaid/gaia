/*!
 * Add to Homescreen v2.0.11 ~ Copyright (c) 2013 Matteo Spinelli, http://cubiq.org
 * Released under MIT license, http://cubiq.org/license
 */
var addToHome = (function (w) {
	var nav = w.navigator,
		isIDevice = 'platform' in nav && (/iphone|ipod|ipad/gi).test(nav.platform),
		isIPad,
		isRetina,
		isSafari,
		isFirefox,
		isChrome,
		isChromeMobile,
		isStandalone,
		OSVersion,
		startX = 0,
		startY = 0,
		lastVisit = 0,
		isExpired,
		isSessionActive,
		isReturningVisitor,
		balloon,
		overrideChecks,
		applicationName,
		chromeItem,
		manifestUrl,
		icon128,
		favoriteIcon,
    applicationDescription,
    applicationVersion,
    applicationFullURL,
    applicationBaseURL,
    applicationSubdomainURL,
    applicationFileURL,

		positionInterval,
		closeTimeout,

		options = {
			autostart: true,			// Automatically open the balloon
			returningVisitor: false,	// Show the balloon to returning visitors only (setting this to true is highly recommended)
			animationIn: 'drop',		// drop || bubble || fade
			animationOut: 'fade',		// drop || bubble || fade
			startDelay: 2000,			// 2 seconds from page load before the balloon appears
			lifespan: 15000,			// 15 seconds before it is automatically destroyed
			bottomOffset: 14,			// Distance of the balloon from bottom
			expire: 0,					// Minutes to wait before showing the popup again (0 = always displayed)
			message: 'en_us',				// Customize your message or force a language ('' = automatic)
			touchIcon: false,			// Display the touch icon
			arrow: true,				// Display the balloon arrow
			hookOnLoad: true,			// Should we hook to onload event? (really advanced usage)
			closeButton: true,			// Let the user close the balloon
			iterations: 100				// Internal/debug use
		},

		intl = {
			ar:    '<span dir="rtl">قم بتثبيت هذا التطبيق على <span dir="ltr">%device:</span>انقر<span dir="ltr">%icon</span> ،<strong>ثم اضفه الى الشاشة الرئيسية.</strong></span>',
			ca_es: 'Per instal·lar aquesta aplicació al vostre %device premeu %icon i llavors <strong>Afegir a pantalla d\'inici</strong>.',
			cs_cz: 'Pro instalaci aplikace na Váš %device, stiskněte %icon a v nabídce <strong>Přidat na plochu</strong>.',
			da_dk: 'Tilføj denne side til din %device: tryk på %icon og derefter <strong>Føj til hjemmeskærm</strong>.',
			de_de: 'Installieren Sie diese App auf Ihrem %device: %icon antippen und dann <strong>Zum Home-Bildschirm</strong>.',
			el_gr: 'Εγκαταστήσετε αυτήν την Εφαρμογή στήν συσκευή σας %device: %icon μετά πατάτε <strong>Προσθήκη σε Αφετηρία</strong>.',
			en_us: 'Install this web app on your %device: tap %icon and then <strong>Add to Home Screen</strong>.',
			es_es: 'Para instalar esta app en su %device, pulse %icon y seleccione <strong>Añadir a pantalla de inicio</strong>.',
			fi_fi: 'Asenna tämä web-sovellus laitteeseesi %device: paina %icon ja sen jälkeen valitse <strong>Lisää Koti-valikkoon</strong>.',
			fr_fr: 'Ajoutez cette application sur votre %device en cliquant sur %icon, puis <strong>Ajouter à l\'écran d\'accueil</strong>.',
			he_il: '<span dir="rtl">התקן אפליקציה זו על ה-%device שלך: הקש %icon ואז <strong>הוסף למסך הבית</strong>.</span>',
			hr_hr: 'Instaliraj ovu aplikaciju na svoj %device: klikni na %icon i odaberi <strong>Dodaj u početni zaslon</strong>.',
			hu_hu: 'Telepítse ezt a web-alkalmazást az Ön %device-jára: nyomjon a %icon-ra majd a <strong>Főképernyőhöz adás</strong> gombra.',
			it_it: 'Installa questa applicazione sul tuo %device: premi su %icon e poi <strong>Aggiungi a Home</strong>.',
			ja_jp: 'このウェブアプリをあなたの%deviceにインストールするには%iconをタップして<strong>ホーム画面に追加</strong>を選んでください。',
			ko_kr: '%device에 웹앱을 설치하려면 %icon을 터치 후 "홈화면에 추가"를 선택하세요',
			nb_no: 'Installer denne appen på din %device: trykk på %icon og deretter <strong>Legg til på Hjem-skjerm</strong>',
			nl_nl: 'Installeer deze webapp op uw %device: tik %icon en dan <strong>Voeg toe aan beginscherm</strong>.',
			pl_pl: 'Aby zainstalować tę aplikacje na %device: naciśnij %icon a następnie <strong>Dodaj jako ikonę</strong>.',
			pt_br: 'Instale este aplicativo em seu %device: aperte %icon e selecione <strong>Adicionar à Tela Inicio</strong>.',
			pt_pt: 'Para instalar esta aplicação no seu %device, prima o %icon e depois em <strong>Adicionar ao ecrã principal</strong>.',
			ru_ru: 'Установите это веб-приложение на ваш %device: нажмите %icon, затем <strong>Добавить в «Домой»</strong>.',
			sv_se: 'Lägg till denna webbapplikation på din %device: tryck på %icon och därefter <strong>Lägg till på hemskärmen</strong>.',
			th_th: 'ติดตั้งเว็บแอพฯ นี้บน %device ของคุณ: แตะ %icon และ <strong>เพิ่มที่หน้าจอโฮม</strong>',
			tr_tr: 'Bu uygulamayı %device\'a eklemek için %icon simgesine sonrasında <strong>Ana Ekrana Ekle</strong> düğmesine basın.',
			uk_ua: 'Встановіть цей веб сайт на Ваш %device: натисніть %icon, а потім <strong>На початковий екран</strong>.',
			zh_cn: '您可以将此应用程式安装到您的 %device 上。请按 %icon 然后点选<strong>添加至主屏幕</strong>。',
			zh_tw: '您可以將此應用程式安裝到您的 %device 上。請按 %icon 然後點選<strong>加入主畫面螢幕</strong>。'
		};




	function init () {

		// Preliminary check, all further checks are performed on iDevices only
		// XXX
		//if ( !isIDevice) return;
		console.log("add2home")
        if (navigator.mozApps != null)
        {
        	isFirefox = true;
        }
        isChrome = !!window.chrome && !!window.chrome.webstore;  

        isChromeMobile = false;
        if (match = /Android.+(Chrome\S+)/.exec(navigator.userAgent)) {
          if (match[1].substring(7,9) > 31)
          {
            isChromeMobile = true;
          }
        }

		if (( !isIDevice) && (!isFirefox) && (!isChrome) && (!isChromeMobile)) return;
	    //if (( !isIDevice) && (!enyo.platform.firefoxOS)) return;

		var now = Date.now(),
			i;

		// Merge local with global options
		if ( w.addToHomeConfig ) {
			for ( i in w.addToHomeConfig ) {
				options[i] = w.addToHomeConfig[i];
			}
		}
		if ( !options.autostart ) options.hookOnLoad = false;

		isIPad = (/ipad/gi).test(nav.platform);
		isRetina = w.devicePixelRatio && w.devicePixelRatio > 1;
		isSafari = (/Safari/i).test(nav.appVersion) && !(/CriOS/i).test(nav.appVersion);
		isStandalone = nav.standalone;
		OSVersion = nav.appVersion.match(/OS (\d+_\d+)/i);
		OSVersion = OSVersion && OSVersion[1] ? +OSVersion[1].replace('_', '.') : 0;

		lastVisit = +w.localStorage.getItem('addToHome');

		isSessionActive = w.sessionStorage.getItem('addToHomeSession');
		isReturningVisitor = options.returningVisitor ? lastVisit && lastVisit + 28*24*60*60*1000 > now : true;

		if ( !lastVisit ) lastVisit = now;

		// If it is expired we need to reissue a new balloon
		isExpired = isReturningVisitor && lastVisit <= now;

		if ( options.hookOnLoad ) w.addEventListener('load', loaded, false);
		else if ( !options.hookOnLoad && options.autostart ) loaded();
		console.log("loaded listener added")
	}

	function loaded () {
		console.log("loaded")
		w.removeEventListener('load', loaded, false);
		if ( !isReturningVisitor ) w.localStorage.setItem('addToHome', Date.now());
		else if ( options.expire && isExpired ) w.localStorage.setItem('addToHome', Date.now() + options.expire * 60000);

		//if ( !overrideChecks && ( (!isSafari && !isFirefoxOS) || !isExpired || isSessionActive || isStandalone || !isReturningVisitor )) return;

		if (isIDevice)
		{
		  if ( !overrideChecks && ( !isSafari || !isExpired || isSessionActive || isStandalone || !isReturningVisitor ) ) return;
        }
        else if (isFirefox)
        {

          if (navigator.mozApps != null)
          {
             var request = window.navigator.mozApps.checkInstalled(manifestUrl);
             request.onerror = function(e) {
               console.log("Error calling getInstalled: " + request.error.name);
             };

             request.onsuccess = function(e) {
               console.log("Success, Installed? : " + request.result);
               if (!request.result)
               {
		         balloon = document.createElement('div');
		         balloon.id = 'addToHomeScreen';
		         // XXX
		         balloon.style.cssText += 'left:-9999px;transition-property:transform,opacity;transition-duration:0;transform:translate3d(0,0,0);position:fixed';

                 // Let's hardcode the message text
                 options.message = 'Download it as a Application for %device by clicking <a id="installer"> here </a>',

       	         platform = "Firefox";
		         balloon.className = 'addToHomeIphone';
		         balloon.innerHTML = options.message.replace('%device', platform) +
			     (options.closeButton ? '<span class="addToHomeClose" id="closeButton">\u00D7</span>' : '');

		         document.body.appendChild(balloon);

		         // Add the close action
		         if ( options.closeButton ) document.getElementById("closeButton").addEventListener('click', clicked, false);
		         document.getElementById("installer").addEventListener("click", install, false);
		         //balloon.addEventListener('click', window.install, false);

		         setTimeout(show, options.startDelay);

               }
               else
               {
               	 return;	
               }
             };
             return;
          }
          else
          {
          	return;
          }
        }
        else if (isChromeMobile)
        {
		  if ( !overrideChecks && ( !isExpired || isSessionActive || !isReturningVisitor ) ) 
		  {
		  	return;
		  }
		  else
		  {
                 balloon = document.createElement('div');
		         balloon.id = 'addToHomeScreen';
		         // XXX
		         balloon.style.cssText += 'left:-9999px;transition-property:transform,opacity;transition-duration:0;transform:translate3d(0,0,0);position:fixed';

                 // Let's hardcode the message text
                 options.message = 'Add it to your device homescreen for %device by clicking on the options icon and then "Add to homescreen"',

       	         platform = "Android";
		         balloon.className = 'addToHomeIphone';
		         balloon.innerHTML = options.message.replace('%device', platform) +
			     (options.closeButton ? '<span class="addToHomeClose" id="closeButton">\u00D7</span>' : '');

		         document.body.appendChild(balloon);

		         // Add the close action
		         if ( options.closeButton ) document.getElementById("closeButton").addEventListener('click', clicked, false);

		         setTimeout(show, options.startDelay);
		         return;
		  }
        }
        else if (isChrome && (chromeItem != "https://chrome.google.com/webstore/detail/%CHROME_ITEM%"))
        {
          console.log("chromeItem");
          if (chrome.app.isInstalled) {
            return;
          }
          else
          {
             balloon = document.createElement('div');
		         balloon.id = 'addToHomeScreen';
		         // XXX
		         balloon.style.cssText += 'left:-9999px;transition-property:transform,opacity;transition-duration:0;transform:translate3d(0,0,0);position:fixed';

                 // Let's hardcode the message text
                 options.message = 'Download it as a Application for %device by clicking <a id="installer"> here </a>',

       	         platform = "Chrome";
		         balloon.className = 'addToHomeIphone';
		         balloon.innerHTML = options.message.replace('%device', platform) +
			     (options.closeButton ? '<span class="addToHomeClose" id="closeButton">\u00D7</span>' : '');

		         document.body.appendChild(balloon);

		         // Add the close action
		         if ( options.closeButton ) document.getElementById("closeButton").addEventListener('click', clicked, false);
		         document.getElementById("installer").addEventListener("click", install, false);

		         setTimeout(show, options.startDelay);
		         return;
          }
        }
        else
        {
        	return;
        }

		var touchIcon = '',
			platform = nav.platform.split(' ')[0],
			language = nav.language.replace('-', '_');

		balloon = document.createElement('div');
		balloon.id = 'addToHomeScreen';
		// XXX
		balloon.style.cssText += 'left:-9999px;-webkit-transition-property:-webkit-transform,opacity;-webkit-transition-duration:0;-webkit-transform:translate3d(0,0,0);position:' + (OSVersion < 5 ? 'absolute' : 'fixed');

		// Localize message
		if ( options.message in intl ) {		// You may force a language despite the user's locale
			language = options.message;
			options.message = '';
		}
		if ( options.message === '' ) {			// We look for a suitable language (defaulted to en_us)
			options.message = language in intl ? intl[language] : intl['en_us'];
		}

		if ( options.touchIcon ) {
			touchIcon = isRetina ?
				document.querySelector('head link[rel^=apple-touch-icon][sizes="114x114"],head link[rel^=apple-touch-icon][sizes="144x144"],head link[rel^=apple-touch-icon]') :
				document.querySelector('head link[rel^=apple-touch-icon][sizes="57x57"],head link[rel^=apple-touch-icon]');

			if ( touchIcon ) {
				touchIcon = '<span style="background-image:url(' + touchIcon.href + ')" class="addToHomeTouchIcon"></span>';
			}
		}

		  balloon.className = (OSVersion >=7 ? 'addToHomeIOS7 ' : '') + (isIPad ? 'addToHomeIpad' : 'addToHomeIphone') + (touchIcon ? ' addToHomeWide' : '');
		  balloon.innerHTML = touchIcon +
			options.message.replace('%device', platform).replace('%icon', OSVersion >= 4.2 ? '<span class="addToHomeShare"></span>' : '<span class="addToHomePlus">+</span>') +
			(options.arrow ? '<span class="addToHomeArrow"' + (OSVersion >= 7 && isIPad && touchIcon ? ' style="margin-left:-32px"' : '') + '></span>' : '') +
			(options.closeButton ? '<span class="addToHomeClose">\u00D7</span>' : '');

		document.body.appendChild(balloon);

		// Add the close action
		if ( options.closeButton ) balloon.addEventListener('click', clicked, false);

		if ( !isIPad && OSVersion >= 6 ) window.addEventListener('orientationchange', orientationCheck, false);

		setTimeout(show, options.startDelay);
	}

	function show () {
		var duration,
			iPadXShift = 208;

		// Set the initial positiona
		if ((isFirefox) || (isChrome) || (isChromeMobile)) {
            //startY = w.innerHeight + w.scrollY;
            startY = 0;

				//startX = Math.round((w.innerWidth - balloon.offsetWidth) / 2) + w.scrollX;
			    startX = Math.round((w.innerWidth-balloon.offsetWidth) / 2);


				balloon.style.left = startX + 'px';
				//balloon.style.top = startY - balloon.offsetHeight - options.bottomOffset + 'px';
			    balloon.style.top = w.innerHeight/2 + 'px';

			switch ( options.animationIn ) {
				case 'drop':
					duration = '0.6s';
					balloon.style.webkitTransform = 'translate3d(0,' + -(w.scrollY + options.bottomOffset + balloon.offsetHeight) + 'px,0)';
					balloon.style.transform = 'translate3d(0,' + -(w.scrollY + options.bottomOffset + balloon.offsetHeight) + 'px,0)';
					break;
				case 'bubble':
					duration = '0.6s';
					balloon.style.opacity = '0';
					balloon.style.webkitTransform = 'translate3d(0,' + (startY + 50) + 'px,0)';
					balloon.style.transform = 'translate3d(0,' + (startY + 50) + 'px,0)';
					break;
				default:
					duration = '1s';
					balloon.style.opacity = '0';
			}
		} 
		else if ( isIPad ) {
			if ( OSVersion < 5 ) {
				startY = w.scrollY;
				startX = w.scrollX;
			} else if ( OSVersion < 6 ) {
				iPadXShift = 160;
			} else if ( OSVersion >= 7 ) {
				iPadXShift = 143;
			}

			balloon.style.top = startY + options.bottomOffset + 'px';
			balloon.style.left = Math.max(startX + iPadXShift - Math.round(balloon.offsetWidth / 2), 9) + 'px';

			switch ( options.animationIn ) {
				case 'drop':
					duration = '0.6s';
					balloon.style.webkitTransform = 'translate3d(0,' + -(w.scrollY + options.bottomOffset + balloon.offsetHeight) + 'px,0)';
					break;
				case 'bubble':
					duration = '0.6s';
					balloon.style.opacity = '0';
					balloon.style.webkitTransform = 'translate3d(0,' + (startY + 50) + 'px,0)';
					break;
				default:
					duration = '1s';
					balloon.style.opacity = '0';
			}
		} else {
			startY = w.innerHeight + w.scrollY;

			if ( OSVersion < 5 ) {
				startX = Math.round((w.innerWidth - balloon.offsetWidth) / 2) + w.scrollX;
				balloon.style.left = startX + 'px';
				balloon.style.top = startY - balloon.offsetHeight - options.bottomOffset + 'px';
			} else {
				balloon.style.left = '50%';
				balloon.style.marginLeft = -Math.round(balloon.offsetWidth / 2) - ( w.orientation%180 && OSVersion >= 6 && OSVersion < 7 ? 40 : 0 ) + 'px';
				balloon.style.bottom = options.bottomOffset + 'px';
			}

			switch (options.animationIn) {
				case 'drop':
					duration = '1s';
					balloon.style.webkitTransform = 'translate3d(0,' + -(startY + options.bottomOffset) + 'px,0)';
					break;
				case 'bubble':
					duration = '0.6s';
					balloon.style.webkitTransform = 'translate3d(0,' + (balloon.offsetHeight + options.bottomOffset + 50) + 'px,0)';
					break;
				default:
					duration = '1s';
					balloon.style.opacity = '0';
			}
		}

		balloon.offsetHeight;	// repaint trick
		balloon.style.webkitTransitionDuration = duration;
		balloon.style.webkitTransitionDuration = duration;
		balloon.style.transitionDuration = duration;
		balloon.style.opacity = '1';
		balloon.style.webkitTransform = 'translate3d(0,0,0)';
		balloon.style.transform = 'translate3d(0,0,0)';
		//balloon.addEventListener('webkitTransitionEnd', transitionEnd, false);

		closeTimeout = setTimeout(close, options.lifespan);
	}

	function manualShow (override) {
		if ( !isIDevice || balloon ) return;

		overrideChecks = override;
		loaded();
	}

	function close () {
		clearInterval( positionInterval );
		clearTimeout( closeTimeout );
		closeTimeout = null;

		// check if the popup is displayed and prevent errors
		if ( !balloon ) return;

		var posY = 0,
			posX = 0,
			opacity = '1',
			duration = '0';

		if ( options.closeButton ) balloon.removeEventListener('click', clicked, false);
		if ( !isIPad && OSVersion >= 6 ) window.removeEventListener('orientationchange', orientationCheck, false);

		if ( OSVersion < 5 ) {
			posY = isIPad ? w.scrollY - startY : w.scrollY + w.innerHeight - startY;
			posX = isIPad ? w.scrollX - startX : w.scrollX + Math.round((w.innerWidth - balloon.offsetWidth)/2) - startX;
		}

		balloon.style.webkitTransitionProperty = '-webkit-transform,opacity';

		switch ( options.animationOut ) {
			case 'drop':
				if ( isIPad ) {
					duration = '0.4s';
					opacity = '0';
					posY += 50;
				} else {
					duration = '0.6s';
					posY += balloon.offsetHeight + options.bottomOffset + 50;
				}
				break;
			case 'bubble':
				if ( isIPad ) {
					duration = '0.8s';
					posY -= balloon.offsetHeight + options.bottomOffset + 50;
				} else {
					duration = '0.4s';
					opacity = '0';
					posY -= 50;
				}
				break;
			default:
				duration = '0.8s';
				opacity = '0';
		}

		balloon.addEventListener('webkitTransitionEnd', transitionEnd, false);
		balloon.style.opacity = opacity;
		balloon.style.webkitTransitionDuration = duration;
		balloon.style.webkitTransform = 'translate3d(' + posX + 'px,' + posY + 'px,0)';
	}

    function install()
    {
      if (isChrome)
      { 
        chrome.webstore.install(chromeItem,
                            function(){alert("Application is being installed");close();},
                            function(error){alert("App could not be installed " + error);});
      }
      else if (navigator.mozApps != null)
      {
        var req = navigator.mozApps.install(manifestUrl);
        req.onsuccess = function() {
          var appRecord = this.result;
          appRecord.launch();
          console.log("Application is being installed");
          close();
        };
        req.onerror = function() {
          alert("App could not be installed " + this.error.name);
        };
      }
    }


	function clicked () {
		w.sessionStorage.setItem('addToHomeSession', '1');
		isSessionActive = true;
		close();
	}

	function transitionEnd () {
		balloon.removeEventListener('webkitTransitionEnd', transitionEnd, false);

		balloon.style.webkitTransitionProperty = '-webkit-transform';
		balloon.style.webkitTransitionDuration = '0.2s';

		// We reached the end!
		if ( !closeTimeout ) {
			balloon.parentNode.removeChild(balloon);
			balloon = null;
			return;
		}

		// On iOS 4 we start checking the element position
		if ( OSVersion < 5 && closeTimeout ) positionInterval = setInterval(setPosition, options.iterations);
	}

	function setPosition () {
		var matrix = new WebKitCSSMatrix(w.getComputedStyle(balloon, null).webkitTransform),
			posY = isIPad ? w.scrollY - startY : w.scrollY + w.innerHeight - startY,
			posX = isIPad ? w.scrollX - startX : w.scrollX + Math.round((w.innerWidth - balloon.offsetWidth) / 2) - startX;

		// Screen didn't move
		if ( posY == matrix.m42 && posX == matrix.m41 ) return;

		balloon.style.webkitTransform = 'translate3d(' + posX + 'px,' + posY + 'px,0)';
	}

	// Clear local and session storages (this is useful primarily in development)
	function reset () {
		w.localStorage.removeItem('addToHome');
		w.sessionStorage.removeItem('addToHomeSession');
	}

	function orientationCheck () {
		balloon.style.marginLeft = -Math.round(balloon.offsetWidth / 2) - ( w.orientation%180 && OSVersion >= 6 && OSVersion < 7 ? 40 : 0 ) + 'px';
	}

	function makeAppInstallable()
  {
    // Installable as apps
    var appleMobileWeb = document.createElement('meta');
    appleMobileWeb.setAttribute('name', 'apple-mobile-web-app-capable');
    appleMobileWeb.setAttribute('content', 'yes');
    var html5MobileWeb = document.createElement('meta'); // Google
    html5MobileWeb.setAttribute('name', 'mobile-web-app-capable');
    html5MobileWeb.setAttribute('content', 'yes');
    // Icons 
    var appleIcon = document.createElement('link'); // Google
    appleIcon.setAttribute('rel', 'apple-touch-icon-precomposed');
    appleIcon.setAttribute('href', icon128);
    var favIcon = document.createElement('link'); // Google
    favIcon.setAttribute('rel', 'shortcut icon');
    favIcon.setAttribute('href', favoriteIcon);
    // Names
    var html5Name = document.createElement('meta'); // Google
    html5Name.setAttribute('name', 'application-name');
    html5Name.setAttribute('href', applicationName);
    var appleName = document.createElement('meta'); // Google
    appleName.setAttribute('name', 'application-mobile-web-app-title');
    appleName.setAttribute('href', applicationName);
    // Chrome Item
    var chromeStoreItem = document.createElement('link'); // Google
    chromeStoreItem.setAttribute('rel', 'chrome-webstore-item');
    chromeStoreItem.setAttribute('href', chromeItem);
  
    document.getElementsByTagName('head')[0].appendChild(appleMobileWeb);
    document.getElementsByTagName('head')[0].appendChild(html5MobileWeb);
    document.getElementsByTagName('head')[0].appendChild(appleIcon);
    document.getElementsByTagName('head')[0].appendChild(favIcon);
    document.getElementsByTagName('head')[0].appendChild(html5Name);
    document.getElementsByTagName('head')[0].appendChild(appleName);
    document.getElementsByTagName('head')[0].appendChild(chromeStoreItem);
  }

	// Bootstrap!
	console.log("bootstrap");

  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', 'app.json', true);
  xobj.onreadystatechange = function () {
    if (xobj.readyState == 4 && xobj.status == "200") {
      console.log(xobj.responseText)
      var jsonresponse = JSON.parse(xobj.responseText);

      applicationName = jsonresponse[0].name;
      icon128 =  jsonresponse[0].icon128;
		  chromeItem='https://chrome.google.com/webstore/detail/' + chromeItem;

      applicationDescription = jsonresponse[0].description;
      applicationVersion = jsonresponse[0].version;

      applicationFullURL = jsonresponse[0].url;
      applicationBaseURL = jsonresponse[0].baseUrl;
      applicationSubdomainURL = jsonresponse[0].subdomainUrl;
      applicationFileURL = jsonresponse[0].fileURL;
		  manifestUrl = applicationBaseURL + applicationSubdomainURL + "/manifest.webapp";

		  favoriteIcon ="favIcon.ico";
      makeAppInstallable();
      init();
    }
  }
  xobj.send(null);

	return {
		show: manualShow,
		close: close,
		reset: reset
	};
})(window);
