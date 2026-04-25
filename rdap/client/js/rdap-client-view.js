/**
 * 참고내용 : 이 소스는 rdap.org 의 javascript를 참조되어 작성되었음. 
 * 수정일시 : 2025.11.06 
 * 수정내용 : 
 *  1) DarkTheme 관련 부분 제거
 *  2) cardTitle 영문/한글 제공
 *  3) getRDAPURL() URL 변경
 *  4) sendQuery() timeout 설정 변경
 *  5) 수정된 function list
 *   - handleError()
 *   - handleRespose()
 *   - processObject()
 *   - processCommonObjectProperties()
 *   - processEvents()
 *   - guessType()
 *  6) 추가된 function list
 *   - addPropertyError()
 *   - createErrorPannel()
 *   - processIpNetworks()
 *   - makePanel()
 *   - makePanelHeading()
 *   - makePanelBody()
 *   - makeHeadContent()
 *   - changeLanguage()
 *   - changeEventLanguage()
 *   - makeSpineContent()
 * 
 * [클라이언트사이드 → 서버사이드 포맷 통일 수정] 2026.03.06
 *  7) 서버사이드 결과와 동일한 출력 포맷으로 수정
 *   - addProperty() : <dl>/<dt>/<dd> → <tr>/<th>/<td> (table 기반)
 *   - processObject() : <dl> 컨테이너 → <tbody>+<table>+"일반 정보" 레이블
 *   - processEvents() : 중첩 dl → 이벤트명|날짜 2컬럼 단일 행
 *   - processStatus() : <ul>/<li> → 불릿 텍스트(• status<br>)
 *   - processLinks() : <ul>/<li> → 불릿 텍스트(• link<br>)
 *   - processCidrs() : <ul>/<li> → 불릿 텍스트
 *   - processDNSSEC() : <dl> → 내부 table
 *   - processJSCard() : <dl> → 내부 table
 *   - processJSCardAddress1/processJSCardAddress() : <dl> → 내부 table
 *   - processVCardArray() : <dl> → 내부 table
 *   - createErrorPannel() : <dl> → 내부 table
 *   - addSectionLabel() : 섹션 레이블 행 추가 helper 함수 추가
 */


// Initiate variables
var elementCounter = 123456; // keepstrack of the elements we've created so we can assign a unique ID
var rdap_response = '';
var history_href = window.location.href;
var rdap_json_response = '';

window.onpopstate = function(e) {
	// when navigating using back/forward bottons
	if(window.location.search == '') {
		// we reached home page
		document.getElementById('object').focus();
		document.getElementById('object').value = '';
		document.getElementById('output-div').innerHTML = '';
	}else{
		checkParams();
	}
	
	history_href = window.location.href;
}


	var cardTitles_en = {
		"domain": "Domain Name",
		"ip network": "IP Network",
		"nameserver": "Nameserver",
		"entity": "Entity",
		"autnum": "AS Number",
	};
	
	var cardTitles_ko = {
		"domain": "도메인 정보",
		"ip network": "IP 네트워크 정보",
		"nameserver": "네임서버 정보",
		"entity": "엔터티 정보",
		"autnum": "AS번호 정보",
	};

	// event handler for when the query type changes
	function updatePlaceHolder(type) {
		var input = document.getElementById('object');
		
		switch (type) {
			case 'ip':
				input.placeholder = '192.168.0.1/16';
				break;
			case 'autnum':
				input.placeholder = '65535';
				break;
			case 'entity':
				input.placeholder = 'ABC123-EXAMPLE';
				break;
			case 'url':
				input.placeholder = 'https://rdap.nominet.uk/uk/domain/example.uk';
				break;
			case 'tid':
				input.placeholder = 'example';
				break;
			case 'registrar':
				input.placeholder = '9999';
				break;
			case 'json':
				input.placeholder = '{ (paste JSON)}';
				break;
				
			default:
				input.placeholder = 'example.com';
		}
	}

	// event handler for when the submit button is pressed, or
	// when the user clicks on a link to an RDAP URL
	function doQuery() {
		var type = document.getElementById('type');
		var typeval = type.options[type.selectedIndex].value;
		var object = document.getElementById('object').value;
		var lang = document.getElementById('lang').value;
		
		var url;
		if('url' == typeval) {
			url = object;
		}else if('tld' == typeval) {
			url = 'https://root.rdap.org/domain/' + object;
		}else if('registrar' == typeval) {
			url = 'https://registrars.rdap.org/entity/' + object + '-IANA';
		}else if('json' == typeval) {
			url = 'json://' + object;
		}else {
			url = getRDAPURL(typeval, object, lang);
		}
		
		sendQuery(url);
	}

	// construct an RDAP URL for the given object
	function getRDAPURL(typeval, object, lang) {
		//return 'https://rdap.kisa.or.kr/bootstrap/' + typeval + '/' + object;
		return 'https://rdap.org/' + typeval + '/' + object;

	}

	// given a URL, injects that URL into the query input,
	// and initiates an RDAP query
	function runQuery(url, e) {
		e.preventDefault();
		var type = document.getElementById('type');
		
		for(var i=0; i<type.options.length; i++) if('url' == type.options[i].value) type.selectedIndex = i;
		document.getElementById('object').value = url;
		doQuery();
	}


	//disable the user interface, initiate an XHR
	function sendQuery(url) {
		freezeUI();
		
		var lang = document.getElementById('lang').value;
		
		var div = document.getElementById('output-div');
		div.innerHTML = '';
		div.innerHTML = makeSpineContent('spinTd');
		var spinTable = document.getElementById('spinTd');
		
			var spinner = document.createElement('div');
			spinner.classList.add('spinner-border');
			spinner.role = 'status';
			var span = spinner.appendChild(document.createElement('span'));
			span.classList.add('sr-only');
			span.appendChild(document.createTextNode('Loding...'));
			spinTable.appendChild(spinner);
			//div.appendChild(spinner);
		
		if(0 == url.indexOf('json://')) {
			// run the callback with a mock XHR
			handleResponse({
				"status": 200,
				"responseText": url.substring(7)
			});
		}else{
			var xhr = new XMLHttpRequest();		
			xhr.open('GET', url);
			if(lang == '2') xhr.setRequestHeader("Accept-Language", "en");
			//xhr.timeout = 25000;
			xhr.timeout = 5000;
			xhr.responseType = 'json';
			
			xhr.ontimeout = function() {
				thawUI();
				handleError(changeLanguage('Timeout performing query, please try again later.'));
			};
			
			xhr.onload = function() { handleResponse(xhr); };
			
			xhr.send();
		}
	}

	function handleError(error, object) {
		var div = document.getElementById('output-div');
		div.innerHTML = '';
		div.appendChild(createErrorNode(error));
		
		if(object) div.appendChild(createErrorPannel(object));
	}

	function createErrorNode(error) {
		el = document.createElement('p');
		el.classList.add('error', 'alert', 'alert-warning');
		el.appendChild(document.createTextNode(error));
		
		return el;
	}
	
	function addPropertyError(dd, value) {
		if(value instanceof Node) {
			dd.appendChild(value);
		}else{
			dd.appendChild(document.createTextNode(String(value)));
		}
	}
	
	function createErrorPannel(object) {
		// tbody1: description rows
		var tbody1 = document.createElement('tbody');
		var table1 = document.createElement('table');
		table1.classList.add('table');
		table1.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table1.appendChild(tbody1);
		
		// tbody2: raw data row
		var tbody2 = document.createElement('tbody');
		var table2 = document.createElement('table');
		table2.classList.add('table');
		table2.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table2.appendChild(tbody2);
		
		var panel = makePanel('danger');
		var titleText = '';
		if(object.title) titleText = object.title;
		if(object.errorCode) titleText = object.errorCode + ' : ' + object.title;
		
		var heading = makePanelHeading(false, titleText);
		panel.appendChild(heading);
		
		var body = makePanelBody(false);
		
		if(object.description) {
			var tr = document.createElement('tr');
			var th = document.createElement('th');
			th.setAttribute('scope', 'row');
			th.setAttribute('width', '25%');
			th.classList.add('rdap-property-name');
			th.appendChild(document.createTextNode(changeLanguage('Description')+':'));
			tr.appendChild(th);
			
			var td = document.createElement('td');
			td.setAttribute('colspan', '2');
			for(var i=0; i<object.description.length; i++) {
				var p = document.createElement('p');
				p.appendChild(document.createTextNode(object.description[i]));
				addPropertyError(td, p);
			}
			tr.appendChild(td);
			tbody1.appendChild(tr);
		}

		var wrapper1 = document.createElement('div');
		wrapper1.classList.add('panel-body');
		wrapper1.appendChild(table1);
		body.appendChild(wrapper1);
		
		// Raw Data
		var objectName = 'Error';
		var titleText2 = objectName + ' json Raw data:';
		var pre = document.createElement('pre');
		pre.appendChild(document.createTextNode(JSON.stringify(object, null, 2)));

		var error_panel = makePanel('default');
		
		var RawDataName = 'RawElement-' + objectName;
		var error_heading = makePanelHeading(true, RawDataName);
		error_heading.innerHTML = makeHeadContent(titleText2, RawDataName, false);
		error_panel.appendChild(error_heading);
		var error_body = makePanelBody(true, RawDataName, false);
		
		error_body.appendChild(pre);
		error_panel.appendChild(error_body);
		addPropertyBlock(tbody2, 'Raw data', error_panel);
		
		var wrapper2 = document.createElement('div');
		wrapper2.classList.add('panel-body');
		wrapper2.appendChild(table2);
		body.appendChild(wrapper2);

		panel.appendChild(body);
		
		return panel;
	}

	//callback executed when a respose is received
	function handleResponse(xhr) {
		thawUI();
		
		if(404 == xhr.status) {
			console.log('handleResponse: 404 Error');
			if(xhr.response) handleError(changeLanguage('This Object does not exist.'), xhr.response);
			else handleError(changeLanguage('Page not found'));
		}else if(200 != xhr.status) {
			handleError(xhr.status + ' error: ' + xhr.statusText, xhr.response);
		}else{
			try{
				var url = document.createElement('a');
				url.href = window.location.href;
				url.search = '?type=' + escape(document.getElementById('type').value) + '&object=' + escape(document.getElementById('object').value);
				
				if(history_href != url.href) {
					window.history.pushState(null, window.title, url.href);
					history_href = url.href;
				}
				
				var div = document.getElementById('output-div');
				div.innerHTML = '';
				rdap_response = xhr.response; // debug
				rdap_json_response = JSON.stringify(rdap_response, null, 2);
				div.appendChild(processObject(xhr.response, true));
				
				initiate();
				
			}catch(e) {
				handleError('handleResponse() Exception: ' + e.message);
			}
		}
	}

	// process an RDAP object. Argument is a JSON object, return
	// value is an element that can be inserted into the page
	function processObject(object, toplevel) {
		if(!object) return false;
		
		// tbody 기반 테이블 컨테이너 생성 (서버사이드 포맷)
		var tbody = document.createElement('tbody');
		
		switch(object.objectClassName) {
			case 'domain':
				processDomain(object, tbody, toplevel);
				break;
			case 'nameserver':
				processNameserver(object, tbody, toplevel);
				break;
			case 'entity':
				processEntity(object, tbody, toplevel);
				break;
			case 'autnum':
				processAutnum(object, tbody, toplevel);
				break;
			case 'ip network':
				processIp(object, tbody, toplevel);
				break;
				
			default:
				if(object.errorCode) {
					console.log('errorCode: ' + object.errorCode);
					return createErrorNode(object.errorCode + 'error:' + object.title);
				}else{
					return createErrorNode("unknown object type '" + object.objectClassName + "'");
				}
		}
		
		// 테이블 생성 (서버사이드: <table class="table">)
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none; table-layout: fixed; width: 100%;');
		table.appendChild(tbody);
		
		// tableWrapper/mainLabel 제거 → table을 body에 직접 append
		
		var panel = makePanel(toplevel ? 'primary' : 'default');
		
		var titleText = '';
		if(object.roles) {
			title = String(object.roles);
			titleText = title.charAt(0).toUpperCase() + title.slice(1) + ": ";
		}
		if(object.unicodeName) {
			titleText += object.unicodeName;
		}else if(object.ldhName) {
			titleText += object.ldhName;
		}else if(object.handle) {
			titleText += object.handle;
		}
		
		if(toplevel) {
			var lang = document.getElementById('lang').value;
			if(lang == '1') titleText = cardTitles_ko[object.objectClassName] + ': ' + titleText;
			else titleText = cardTitles_en[object.objectClassName] + ': ' + titleText;
		}
		
		var objectName = '';
		if('ip network' == object.objectClassName) objectName = 'ip';
		else objectName = object.objectClassName;
		
		objID = Math.floor(Math.random() * 90 + 100);
		objectName += objID;
		var heading = makePanelHeading(true, objectName);
		heading.innerHTML = makeHeadContent(titleText, objectName, toplevel);
		
		panel.appendChild(heading);
		
		var body = makePanelBody(true, objectName, toplevel);
		body.appendChild(table);
		
		panel.appendChild(body);
		
		return panel;
	}

	// simplify the proess of adding a name => value to a definition list
	// [수정] dl/dt/dd → tbody/tr/th/td (서버사이드 포맷 통일)
	function addProperty(dl, name, value) {
		var tr = document.createElement('tr');
		
		var th = document.createElement('th');
		th.setAttribute('scope', 'row');
		th.setAttribute('width', '25%');
		th.classList.add('rdap-property-name');
		th.appendChild(document.createTextNode(changeLanguage(name)+':'));
		tr.appendChild(th);
		
		var td = document.createElement('td');
		td.setAttribute('colspan', '2');
		td.classList.add('rdap-property-value');
		if(value instanceof Node) {
			td.appendChild(value);
		}else{
			td.appendChild(document.createTextNode(String(value)));
		}
		tr.appendChild(td);
		dl.appendChild(tr);
	}

	// [추가] 패널형 콘텐츠: 라벨은 한 행, 콘텐츠는 아래 줄에 들여쓰기로 표시
	// (엔터티 정보, 네임서버 정보, Networks 등 패널이 포함된 경우 사용)
	function addPropertyBlock(tbody, name, value) {
		// 1행: 라벨 (전체 너비)
		var trLabel = document.createElement('tr');
		var tdLabel = document.createElement('td');
		tdLabel.setAttribute('colspan', '3');
		tdLabel.setAttribute('style', 'padding-bottom: 2px; font-weight: bold; border-bottom: none;');
		tdLabel.classList.add('rdap-property-name');
		tdLabel.appendChild(document.createTextNode(changeLanguage(name)+':'));
		trLabel.appendChild(tdLabel);
		tbody.appendChild(trLabel);

		// 2행: 들여쓰기(padding-left) + 콘텐츠
		var trContent = document.createElement('tr');
		var tdContent = document.createElement('td');
		tdContent.setAttribute('colspan', '3');
		tdContent.setAttribute('style', 'padding-left: 20px; border-top: none; padding-bottom: 0px; width: 100%; max-width: 0;');
		tdContent.classList.add('rdap-property-value');
		if(value instanceof Node) {
			tdContent.appendChild(value);
		} else {
			tdContent.appendChild(document.createTextNode(String(value)));
		}
		trContent.appendChild(tdContent);
		tbody.appendChild(trContent);
	}

	// [추가] 섹션 구분 레이블 행 추가 helper (서버사이드 포맷: <label>섹션명</label>)
	function addSectionLabel(tbody, labelText) {
		var tr = document.createElement('tr');
		var td = document.createElement('td');
		td.setAttribute('colspan', '3');
		td.setAttribute('style', 'padding-top: 10px; padding-bottom: 2px; border-top: 1px solid #ddd;');
		var br = document.createElement('br');
		td.appendChild(br);
		var label = document.createElement('label');
		label.appendChild(document.createTextNode(labelText));
		td.appendChild(label);
		tr.appendChild(td);
		tbody.appendChild(tr);
	}

	// called by individual object processors, since all RDAP objects have a similar set of
	// properties. the first argument is the RDAP object and the second is the <tbody> element
	// being used to display that object.
	function processCommonObjectProperties(object, dl, toplevel) {
		// if(object.objectClassName) addProperty(dl, 'Object Type:', object.objectClassName);
		// if(object.handle) addProperty(dl, 'Handle:', object.handle);
		if(object.status) processStatus(object.status, dl);
		if(object.events) processEvents(object.events, dl);
		if(object.entities) processEntities(object.entities, dl);
		if(object.remarks) {
			processRemarks(object.remarks, dl);
		}
		if(object.notices) {
			processNotices(object.notices, dl);
		}
		if(object.links) processLinks(object.links, dl);
		if(object.lang) addProperty(dl, 'Language', object.lang);
		if(object.port43) {
			if(object.port43 == 'whois.nic.uk') { // Nominet specific
				link = document.createElement('a');
				if(rdap_response.objectClassName == 'domain')
					link.href = 'https://rdap.uk/whois/?type=domain&object='+rdap_response.unicodeName;
				else
					link.href = 'https://rdap.uk/whois/';
				link.appendChild(document.createTextNode(object.port43));
				addProperty(dl, 'Whois Server', link);
			} else 
			addProperty(dl, 'Whois Server', object.port43);
		}
		if(object.cidr0_cidrs) processCidrs(object.cidr0_cidrs, dl);
		if(object.rdapConformance) {
			processrdapConformance(object.rdapConformance, dl);
		}
		
		var objectName = object.objectClassName;
		var titleText = 'Object ('+objectName+') json Raw data:';
		var pre = document.createElement('pre');
		if(toplevel) {
			titleText = 'Object ('+objectName+') Full json Raw data:';
			pre.appendChild(document.createTextNode(rdap_json_response));
		} else {
			pre.appendChild(document.createTextNode(JSON.stringify(object, null, 2)));
		}		
		
		var panel = makePanel('default');
		
		var RawDataName = 'RawElement-' + ++elementCounter;
		var heading = makePanelHeading(true, RawDataName);
		heading.innerHTML = makeHeadContent(titleText, RawDataName, false);
		panel.appendChild(heading);
		var body = makePanelBody(true, RawDataName, false);
		
		body.appendChild(pre);
		panel.appendChild(body);
		addPropertyBlock(dl, 'Raw Data', panel);
		
	}

	// call back for "Show Raw Data" button
	function showRawData(id) {
		var div = document.getElementById(id);
		div.childNodes[0].style = 'display:none;visibility:hidden';
		div.childNodes[1].style = 'display:block;visibility:visible';
	}

	// convert an array into a bulleted list
	function createList(list) {
		var ul = document.createElement('ul');
		
		for(var i=0; i<list.length; i++) {
			var li = document.createElement('li');
			if(list[i] instanceof Node) {
				li.appendChild(list[i]);
			}else{
				li.appendChild(document.createTextNode(list[i]));
			}
			ul.appendChild(li);
		}
		
		return ul;
	}

	// add the RDAP conformance of the response
	function processrdapConformance(rdapConformance, dl) {
		var div = document.createElement('div');
		for(var i = 0; i < rdapConformance.length; i++) {
			var itemSpan = document.createElement('span');
			itemSpan.appendChild(document.createTextNode('• ' + rdapConformance[i]));
			itemSpan.appendChild(document.createElement('br'));
			div.appendChild(itemSpan);
		}
		addProperty(dl, 'Conformance', div);
	}

	// add object's status code
	// [수정] <ul>/<li> → 불릿 텍스트(• status<br>) - 서버사이드 포맷
	function processStatus(status, dl) {
		var statusDiv = document.createElement('div');
		
		for(var i=0; i<status.length; i++) {
			var itemSpan = document.createElement('span');
			itemSpan.appendChild(document.createTextNode('• '));
			
			var link;
			link = document.createElement('a');
			link.href = 'javascript:void(0)';
			link.setAttribute('data-toggle', 'tooltip');
			link.setAttribute('data-bs-placement', 'right');
			link.appendChild(document.createTextNode(status[i]));
			
			var lang = document.getElementById('lang').value;
			
			if(lang == '1') { // 1 is ko , 2 is en
				if(status[i] == 'active') {
					link.title = '이것은 도메인의 표준 상태로, 보류 중인 작업이나 금지 사항이 없음을 의미합니다.';
				}else if(status[i] == 'inactive') {
					link.title = '이 도메인은 네임서버가 없으며 DNS에서 활성화되어 있지 않습니다.';
				}else if(status[i] == 'server hold') {
					link.title = '이 도메인은 DNS에서 활성화되지 않았습니다.';
					link.classList.add('text-danger');
					link.appendChild(document.createTextNode(' \u26A0'));
				}else if(status[i] == 'pending delete') {
					link.title = '이 상태 코드는 도메인이 30일이 경과되어 만료되었으며 해당 유예 기간내에 복원되지 않았음을 나타냅니다. (gTLD 인 경우)도메인은 60일 더 이 상태로 유지되며, 그 후 삭제되어 레지스트리 데이터베이스에서 삭제됩니다. 삭제가 발생하면 도메인을 재등록할 수 있습니다.';
					link.classList.add('text-danger');
					link.appendChild(document.createTextNode(' \u26A0'));
				}else if(status[i] == 'pending transfer') {
					link.title = '이 상태 코드는 새 등록기관(registrar)으로의 도메인 이전(transfer) 요청이 접수되어 처리 중임을 나타냅니다.';
				}else if(status[i] == 'server delete prohibited') {
					link.title = '이 상태 코드는 도메인이 삭제되는 것을 방지합니다. 일반적으로 법적 분쟁, 사용자의 요청에 따라 또는 상환 기간 상태(redemptionPeriod)가 있을 때 제정되는 드문 상태 입니다.';
				}else if(status[i] == 'server renew prohibited') {
					link.title = '이 상태 코드는 도메인의 레지스트리 운영자가 도메인 등록 기관(registrar)이 도메인을 갱신하는 것을 허용하지 않음을 나타냅니다. 이는 일반적으로 법적 분쟁 중에 또는 도메인이 삭제될 수 있는 경우에 제정되는 드문 상태 입니다.';
				}else if(status[i] == 'server transfer prohibited') {
					link.title = '이 상태 코드는 도메인이 현재 등록 기관에서 다른 등록 기관으로 이전되는 것을 방지합니다. 이는 일반적으로 법적 또는 기타 분쟁, 사용자의 요청에 따라 또는 상환 기간 상태(redemptionPeriod)가 있을 때 제정되는 드문 상태입니다.';
				}else if(status[i] == 'server update prohibited') {
					link.title = '이 상태 코드는 도메인이 업데이트되지 않도록 잠급니다. 이는 일반적으로 법적 분쟁, 사용자의 요청에 따라 또는 상환 기간 상태(redemptionPeriod)가 있는 경우에 제정되는 드문 상태 입니다.';
				}else if(status[i] == 'client delete prohibited') {
					link.title = '이 상태 코드는 도메인의 레지스트리에 도메인 삭제 요청을 거부하도록 지시 합니다.';
				}else if(status[i] == 'client renew prohibited') {
					link.title = '이 상태 코드는 도메인의 레지스트리에 도메인 갱신 요청을 거부하도록 지시 합니다. 이는 일반적으로 법적 분쟁 중에 또는 도메인이 삭제 대상이 되는 경우에 제정되는 드문 상태입니다.';
				}else if(status[i] == 'client transfer prohibited') {
					link.title = '이 상태 코드는 도메인의 레지스트리가 현재 등록 기관에서 다른 등록 기관으로 도메인을 이전하라는 요청을 거부하도록 지시합니다.';
				}else if(status[i] == 'client update prohibited') {
					link.title = '이 상태 코드는 도메인의 레지스트리에 도메인 업데이트 요청을 거부하라고 알려줍니다.';
				}else if(status[i] == 'add period') {
					link.title = '이 유예 기간은 도메인 이름을 처음 등록한 수에 제공됩니다. 이 기간동안 등록 기관(registrar)이 도메인 이름을 삭제하는 경우, 등록 기관(registry)은 등록 비용에 대해 등록 기관(registrar)에 크레딧(환불)을 제공할 수 있습니다.';
				}else if(status[i] == 'redemption period') {
					link.title = '이 상태 코드는 등록(대행)기관(registrar)이 등록기관(registry)에 도메인 삭제를 요청했음을 나타냅니다. 도메인은 30일 동안 이 상태로 유지됩니다.';
				}
			}else if(lang == '2') { // en
				if(status[i] == 'active') {
					link.title = 'This is the standard status for a domain, meaning it has no pending operations or prohibitions.';
				}else if(status[i] == 'inactive') {
					link.title = 'This domain has no nameservers and is not activated in the DNS.';
				}else if(status[i] == 'server hold') {
					link.title = 'This domain is not activated in the DNS';
					link.classList.add('text-danger');
					link.appendChild(document.createTextNode(' \u26A0'));
				}else if(status[i] == 'pending delete') {
					link.title = 'This status code indicates that the domain has expired for more than 30 days and has not been restored within that grace period. The domain will remain in this status for 60 more days, after which time it will be purged and dropped from the registry database. Once deletion occurs, the domain is available for re-registration.';
					link.classList.add('text-danger');
					link.appendChild(document.createTextNode(' \u26A0'));
				}else if(status[i] == 'pending transfer') {
					link.title = 'This status code indicates that a request to transfer the domain to a new registrar has been received and is being processed.';
				}else if(status[i] == 'server delete prohibited') {
					link.title = 'This status code prevents the domain from being deleted. It is an uncommon status that is usually enacted during legal disputes, on request, or when a redemptionPeriod status is in place';
				}else if(status[i] == 'server renew prohibited') {
					link.title = 'This status code indicates the domain\u2019s registry will not allow the registrar to renew the domain. It is an uncommon status that is usually enacted during legal disputes or when the domain is subject to deletion.';
				}else if(status[i] == 'server transfer prohibited') {
					link.title = 'This status code prevents the domain from being transferred from the current registrar to another. It is an uncommon status that is usually enacted during legal or other disputes, on request, or when a redemptionPeriod status is in place.';
				}else if(status[i] == 'server update prohibited') {
					link.title = 'This status code is locks the domain preventing it from being updated. It is an uncommon status that is usually enacted during legal disputes, on request, or when a redemptionPeriod status is in place.';
				}else if(status[i] == 'client delete prohibited') {
					link.title = 'This status code tells the domain\u2019s registry to reject requests to delete the domain';
				}else if(status[i] == 'client renew prohibited') {
					link.title = 'This status code tells the domain\u2019s registry to reject requests to renew the domain. It is an uncommon status that is usually enacted during legal disputes or when the domain is subject to deletion.';
				}else if(status[i] == 'client transfer prohibited') {
					link.title = 'This status code tells the domain\u2019s registry to reject requests to transfer the domain from the current registrar to another.';
				}else if(status[i] == 'client update prohibited') {
					link.title = 'This status code tells the domain\u2019s registry to reject requests to update the domain';
				}else if(status[i] == 'add period') {
					link.title = 'This grace period is provided after the initial registration of a domain name. if the registrar deletes the domain name during this period, the registry may provided credit to the registrar for the cost of the registration.';
				}else if(status[i] == 'redemption period') {
					link.title = 'This status code indicates that your registrar has asked the registry to delete your domain. Your domain will be held in this status for 30 days.';
				}
			}
						
			if(!link.title) {
				itemSpan.appendChild(document.createTextNode(status[i]));
			} else {
				itemSpan.appendChild(link);
			}
			itemSpan.appendChild(document.createElement('br'));
			statusDiv.appendChild(itemSpan);
		}
		
		addProperty(dl, 'Status', statusDiv);
	}

	// add the object's events
	// [수정] 중첩 dl → 이벤트명|날짜 2컬럼 단일 행 (서버사이드 포맷)
	function processEvents(events, dl) {
		var lang = document.getElementById('lang').value;
		
		var tr = document.createElement('tr');
		
		var th = document.createElement('th');
		th.setAttribute('scope', 'row');
		th.setAttribute('width', '25%');
		th.classList.add('rdap-property-name');
		th.appendChild(document.createTextNode(changeLanguage('Events')+':'));
		tr.appendChild(th);
		
		// table-layout:fixed + addProperty(colspan=2) 구조로 인해
		// 별도 td 2개를 쓰면 width="22%" 가 무시되고 37.5%로 렌더링됨.
		// → colspan=2 단일 td 내부에 flex 레이아웃으로 서버사이드 포맷 재현.
		var combinedTd = document.createElement('td');
		combinedTd.setAttribute('colspan', '2');

		var innerDiv = document.createElement('div');
		innerDiv.setAttribute('style', 'display:flex;');

		// 이벤트 이름 영역 (서버사이드 td width=22% → 전체의 22% ÷ 75% ≈ 29.3%)
		var namesTd = document.createElement('div');
		namesTd.setAttribute('style', 'width:29.5%;flex-shrink:0;');

		// 이벤트 날짜 영역
		var datesTd = document.createElement('div');
		datesTd.setAttribute('style', 'flex:1;');

		for(var i=0; i < events.length; i++) {
			// 이벤트명 불릿 추가
			namesTd.appendChild(document.createTextNode('• ' + changeEventLanguage(events[i].eventAction)));
			namesTd.appendChild(document.createElement('br'));
			
			// 날짜 span 생성
			var text = document.createElement('span');
			const dateOptions= {
				year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute: '2-digit', seconds: '2-digit', timeZoneName:"short", hour12: false
			};
			if(lang == '2') text.appendChild(document.createTextNode(new Date(events[i].eventDate).toLocaleString('en-US', dateOptions)));
			else {
				text.appendChild(document.createTextNode(new Date(events[i].eventDate).toLocaleString(undefined, dateOptions)));
			}
			text.classList.add('rdap-event-time');
			text.setAttribute('title', events[i].eventDate);
			text.setAttribute('style', 'border-bottom: 1px dashed silver;');
			
			if(events[i].eventActor) {
				var eventActor = document.createElement('span');
				var actorName = events[i].eventActor;
				var url = rdap_response.links[0].href.replace('domain', 'entity');
				var index = url.lastIndexOf('/');
				url = url.substring(0, index+1) + actorName;
				
				var actorLink = document.createElement('a');
				actorLink.href = url;
				actorLink.onclick = new Function("runQuery('" + url + "', event)");
				actorLink.appendChild(document.createTextNode(actorName));
				eventActor.appendChild(document.createTextNode(' by: '));
				eventActor.appendChild(actorLink);
				text.appendChild(eventActor);
			}
			
			var today = new Date();
			var expiration = new Date(events[i].eventDate);
			if(events[i].eventAction == 'expiration' && expiration < today) {
				text.setAttribute('data-toggle', 'tooltip');
				text.setAttribute('data-bs-placement', 'right');
				text.title = 'This domain has expired';
				text.classList.add('text-danger');
				text.appendChild(document.createTextNode(' \u26A0'));
			}
			
			// ": " prefix + date span
			var dateItem = document.createElement('span');
			dateItem.appendChild(document.createTextNode(': '));
			dateItem.appendChild(text);
			datesTd.appendChild(dateItem);
			datesTd.appendChild(document.createElement('br'));
		}

		innerDiv.appendChild(namesTd);
		innerDiv.appendChild(datesTd);
		combinedTd.appendChild(innerDiv);
		tr.appendChild(combinedTd);
		dl.appendChild(tr);
	}

	// add the object's links
	// [수정] <ul>/<li> → 불릿 텍스트(• link<br>) - 서버사이드 포맷
	function processLinks(links, dl) {
		var linksDiv = document.createElement('div');
		
		for(var i=0; i < links.length; i++) {
			var itemSpan = document.createElement('span');
			itemSpan.appendChild(document.createTextNode('• '));
			
			var title = (links[i].title? links[i].title : links[i].href);
			
			var link;
			if(links[i].type && 0 == links[i].type.indexOf('application/rdap+json')) {
				link = createRDAPLink(links[i].href, title);
			}else {
				link = document.createElement('a');
				link.rel = 'noopener';
				link.title = link.href = links[i].href;
				link.target = '_new';
				link.appendChild(document.createTextNode(title));
			}
			
			itemSpan.appendChild(link);
			
			if(links[i].rel) itemSpan.appendChild(document.createTextNode(' (' + links[i].rel + ')'));
			itemSpan.appendChild(document.createElement('br'));
			linksDiv.appendChild(itemSpan);
		}
		
		addProperty(dl, 'Links', linksDiv);
	}
	
	// add the object's Cidr
	// [수정] <ul>/<li> → 불릿 텍스트 - 서버사이드 포맷
	function processCidrs(cidrs, dl) {
		var cidrsDiv = document.createElement('div');
		
		for(var i=0; i < cidrs.length; i++) {
			var itemSpan = document.createElement('span');
			itemSpan.appendChild(document.createTextNode('• '));
			
			var cidr_addr;
			if( cidrs[i].v4prefix ) cidr_addr = cidrs[i].v4prefix;
			if( cidrs[i].v6prefix ) cidr_addr = cidrs[i].v6prefix;
			if( cidrs[i].length ) cidr_addr = cidr_addr + '/' + cidrs[i].length;
			
			itemSpan.appendChild(document.createTextNode(cidr_addr));
			itemSpan.appendChild(document.createElement('br'));
			cidrsDiv.appendChild(itemSpan);
		}
		
		addProperty(dl, 'CIDR', cidrsDiv);
	}
	
	// add the object's networks
	// [수정] addPropertyBlock 사용 → 라벨 아래 들여쓰기로 패널 표시
	function processIpNetworks(networks, dl) {
		var div = document.createElement('div');
		for(var i=0; i < networks.length; i++) div.appendChild(processObject(networks[i]));
		addPropertyBlock(dl, 'Networks', div);
	}
	
	// add the object's entities
	// [수정] addPropertyBlock 사용 → 라벨 아래 들여쓰기로 패널 표시
	function processEntities(entities, dl) {
		var div = document.createElement('div');
		for(var i=0; i < entities.length; i++) div.appendChild(processObject(entities[i]));
		addPropertyBlock(dl, 'Entities', div);
	}
	
	// add the object's remarks
	// [수정] addPropertyBlock 사용 → 라벨 아래 들여쓰기로 패널 표시
	function processRemarks(remarks, dl) {
		addPropertyBlock(dl, 'Remarks', processRemarksOrNotices(remarks));
	}
	
	// add the object's notices
	// [수정] addPropertyBlock 사용 → 라벨 아래 들여쓰기로 패널 표시
	function processNotices(notices, dl) {
		addPropertyBlock(dl, 'Notices', processRemarksOrNotices(notices));
	}

	// command handler for remarks and notices
	function processRemarksOrNotices(things) {
		var div = document.createElement('div');
		
		for(var i=0; i<things.length; i++) {
			var panel = makePanel('default');
			div.appendChild(panel);
			
			var titleText = '';
			if(things[i].title) titleText = things[i].title;
			
			var objectName = '';
			objID = Math.floor(Math.random() * 900 + 100);
			objectName += objID;
			var heading = makePanelHeading(true, objectName);
			heading.innerHTML = makeHeadContent(titleText, objectName);
			panel.appendChild(heading);
			
			var body = makePanelBody(true, objectName);
			panel.appendChild(body);
			
			if(things[i].description) for(var j = 0; j < things[i].description.length ; j++) {
				var p = document.createElement('p');
				p.appendChild(document.createTextNode(things[i].description[j]));
				body.appendChild(p);
			}
			
			if(things[i].links) {
				// links in remarks/notices: use internal table for sub-items
				var ltbody = document.createElement('tbody');
				var ltable = document.createElement('table');
				ltable.classList.add('table');
				ltable.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
				ltable.appendChild(ltbody);
				processLinks(things[i].links, ltbody);
				body.appendChild(ltable);
			}
			
			if(body.childNodes.length < 1) {
				//body.parentNode.removeChild(body);
			}
		}
		
		return div;
	}
	
	// naively match URLs in plain text and convert to links
	function convertURLsToLinks(str) {
		return str.replace(
			/(https?:\/\/[^\s]+[^\.])/g,
			'<a href="$1" target="_new" rel="noopener">$1</a>'
		);
	}

	function processDomain(object, dl, toplevel=false) {
		if(toplevel) document.title = changeLanguage('Domain') + ' ' + (object.unicodeName ? object.unicodeName : object.ldhName) + ' - RDAP Lookup';
		
		var link = document.createElement('a');
		if(!/^https?:\/\//i.test(object.ldhName)) {
			link.href = 'http://' + object.ldhName;
		}else link.href = object.ldhName;
		
		link.rel = 'noopener nofollow';
		link.target = "_blank";
		
		if(object.unicodeName) {
			link.appendChild(document.createTextNode(object.unicodeName));
			addProperty(dl, 'Name', link);
			addProperty(dl, 'ASCII Name', object.ldhName);
		}else{
			link.appendChild(document.createTextNode(object.ldhName));
			addProperty(dl, 'Name', link);
		}
		
		if(object.handle) addProperty(dl, 'Handle', object.handle);
		
		if(object.events) processEvents(object.events, dl);
		if(object.status) processStatus(object.status, dl);
		if(object.entities) processEntities(object.entities, dl);
		
		object.events = object.status = object.entities = null;
		
		if(object.nameservers) {
			var div = document.createElement('div');
			
			for(var i=0; i<object.nameservers.length; i++) div.appendChild(processObject(object.nameservers[i]));
			addPropertyBlock(dl, 'Nameservers', div);
		}
		
		if(object.secureDNS) {
			addPropertyBlock(dl, 'DNSSEC', processDNSSEC(object));
		}else{
			addPropertyBlock(dl, 'DNSSEC', 'Insecure');
		}
		
		processCommonObjectProperties(object, dl, toplevel);
	}
	
	// [수정] 내부 컨테이너를 dl → tbody+table로 변경
	function processDNSSEC(domain) {
		var tbody = document.createElement('tbody');
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table.appendChild(tbody);
		
		if(domain.secureDNS.hasOwnProperty("zoneSigned")) {
			addProperty(tbody, 'Parent zone signed', domain.secureDNS.zoneSigned ? 'Yes' : 'No');
		}
		
		if(domain.secureDNS.hasOwnProperty("delegationSigned")) {
			addProperty(tbody, 'Delegation signed', domain.secureDNS.delegationSigned ? 'Yes' : 'No');
		}
		
		if(domain.secureDNS.hasOwnProperty("maxSigLife")) {
			addProperty(tbody, 'Signature Lifetime', domain.secureDNS.maxSigLife + ' second(s)');
		}
		
		if(domain.secureDNS.hasOwnProperty("dsData")) {
			var div = document.createElement('div');
			
			for(var i=0; i<domain.secureDNS.dsData.length; i++) {
				var panel = makePanel('default');
				var body = makePanelBody(false);
				
				var dsDatatbody = document.createElement('tbody');
				var dsDataTable = document.createElement('table');
				dsDataTable.classList.add('table');
				dsDataTable.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
				dsDataTable.appendChild(dsDatatbody);

				var ds = domain.secureDNS.dsData[i];
				
				addProperty(dsDatatbody, 'Key Tag', ds.keyTag);
				addProperty(dsDatatbody, 'Algorithm', ds.algorithm);
				addProperty(dsDatatbody, 'Digest type', ds.digestType);
				addProperty(dsDatatbody, 'Digest', ds.digest);
				
				body.appendChild(dsDataTable);
				panel.appendChild(body);
				div.appendChild(panel);
			}
			addPropertyBlock(tbody, 'DS Record(s)', div);
		}
		
		if(domain.secureDNS.hasOwnProperty("keyData")) {
			var div = document.createElement('div');
			
			for(var i=0; i<domain.secureDNS.keyData.length; i++) {
				var dsData_panel = makePanel('default');
				var dsData_body = makePanelBody(false);
				
				var dnsKey = domain.secureDNS.keyData[i];
				
				var kTable = dsData_body.appendChild(document.createElement('table'));
				var kTr = kTable.appendChild(document.createElement('tr'));
				var cellsName = domain.ldhName + '.';
				var cells = [
					cellsName,
					"\u00A0",
					"IN",
					"\u00A0",
					"DNSKEY",
					"\u00A0",
					dnsKey.flags,
					"\u00A0",
					dnsKey.protocol,
					"\u00A0",
					dnsKey.algorithm,
					"\u00A0",
					dnsKey.publicKey.match(/./g).join("\u200B")
				];
				
				for(var j=0; j<cells.length; j++) {
					var td = kTr.appendChild(document.createElement('td'));
					td.setAttribute('style', 'vertical-align:top;word-wrap:break-word');
					var code = td.appendChild(document.createElement('code'));
					code.setAttribute('style','white-space:wrap');
					code.appendChild(document.createTextNode(cells[j]));
				}
				
				dsData_panel.appendChild(dsData_body);
				div.appendChild(dsData_panel);
			}
			
			addPropertyBlock(tbody, 'DNSKey Record(s)', div);
		}
		
		return table;
	}

	function processNameserver(object, dl, toplevel=false) {
		if(toplevel) document.title = changeLanguage('Nameserver') + ' ' + object.ldhName + ' - RDAP Lookup';
		
		addProperty(dl, 'Host Name', object.ldhName);
		if(object.unicodeName) addProperty(dl, 'Internationalised Domain Name', object.unicodeName);
		if(object.handle) addProperty(dl, 'Handle', object.handle);
		if(object.ipAddresses) {
			if(object.ipAddresses.v4) {
				for(var i=0; i<object.ipAddresses.v4.length; i++) {
					addProperty(dl, 'IP Address(v4)', createRDAPLink('https://rdap.org/ip/' + object.ipAddresses.v4[i], object.ipAddresses.v4[i]));
				}
			}
			
			if(object.ipAddresses.v6) {
				for(var i=0; i<object.ipAddresses.v6.length; i++) {
					addProperty(dl, 'IP Address(v6)', createRDAPLink('https://rdap.org/ip/' + object.ipAddresses.v6[i], object.ipAddresses.v6[i]));
				}
			}
		}
		
		processCommonObjectProperties(object, dl, toplevel);
	}

	function processEntity(object, dl, toplevel=false) {
		
		if(toplevel) document.title = changeLanguage('Entity') + ' ' + object.handle + ' - RDAP Lookup';
		
		if(object.handle) addProperty(dl, 'Handle', object.handle);
		
		if(object.publicIds) {
			for(var i=0; i<object.publicIds.length; i++) addProperty(dl, object.publicIds[i].type, object.publicIds[i].identifier);
		}
		
		if(object.roles) addProperty(dl, 'Roles', createList(object.roles));
		
		if(object.hasOwnProperty("jscard")) {
			addPropertyBlock(dl, 'Contact Information', processJSCard(object.jscard));
		}else if(object.hasOwnProperty("jscard_0")) {
			addPropertyBlock(dl, 'Contact Information', processJSCard(object.jscard_0));
		}else if(object.hasOwnProperty("jscontact_card")) {
			addPropertyBlock(dl, 'Contact Information', processJSCard(object.jscontact_card));
		}else if(object.vcardArray && object.vcardArray[1]) {
			addPropertyBlock(dl, 'Contact Information', processVCardArray(object.vcardArray[1]));
		}
		
		if(object.networks) processIpNetworks(object.networks, dl);
		
		processCommonObjectProperties(object, dl, toplevel);
	}
	
	// [수정] 내부 컨테이너를 dl → tbody+table로 변경
	function processJSCard(jscard) {
		console.log("processJSCard Entered");
		
		var tbody = document.createElement('tbody');
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table.appendChild(tbody);
		
		if(jscard.hasOwnProperty("version")) addProperty(tbody, 'Version', jscard.version);
		if(jscard.hasOwnProperty("language")) addProperty(tbody, 'Language', jscard.language);
		if(jscard.hasOwnProperty("kind")) addProperty(tbody, 'Kind', jscard.kind);
		
		if(jscard.hasOwnProperty("name")) addProperty(tbody, 'Name', jscard.name.full);
		
		if(jscard.hasOwnProperty("organizations")) {
			addProperty(tbody, 'Organization', jscard.organizations.org.name);
		}
		
		if(jscard.hasOwnProperty("addresses")) {
			addPropertyBlock(tbody, 'Address', processJSCardAddress1(jscard.addresses));
		}
		
		if(jscard.hasOwnProperty("emails")) {
			for(const i in jscard.emails) {
				var link = document.createElement('a');
				link.href = 'mailto:' + jscard.emails.email.address;
				link.appendChild(document.createTextNode(jscard.emails.email.address));
				
				addProperty(tbody, 'Email', link);
			}
		}
		
		if(jscard.hasOwnProperty("phones")) {
			for(const i in jscard.phones) {
				var link = document.createElement('a');
				link.href = 'tel:' + jscard.phones.number;
				link.appendChild(document.createTextNode(jscard.phones.voice.number));
				addProperty(tbody, (jscard.phones.voice.features.voice ? 'Phone' : 'Fax'), link);
			}
		}
		
		if(jscard.hasOwnProperty("localizations")) {
			var local_tbody = document.createElement('tbody');
			var local_table = document.createElement('table');
			local_table.classList.add('table');
			local_table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
			local_table.appendChild(local_tbody);
			
			if(jscard.localizations.ko.hasOwnProperty("name")) addProperty(local_tbody, 'Name', jscard.localizations.ko.name.full);
			if(jscard.localizations.ko.hasOwnProperty("organizations")) addProperty(local_tbody, 'Organization', jscard.localizations.ko.organizations.org.name);
			if(jscard.localizations.ko.hasOwnProperty("emails")) addProperty(local_tbody, 'Email', jscard.localizations.ko.emails.email.address);
			if(jscard.localizations.ko.hasOwnProperty("addresses")) addPropertyBlock(local_tbody, 'Address', processJSCardAddress1(jscard.localizations.ko.addresses));
			
			addPropertyBlock(tbody, 'Localizations', local_table);
		}
		
		if(jscard.hasOwnProperty("links")) {
			for(const i in jscard.links) {
				var link = document.createElement('a');
				link.href = jscard.links.url.uri;
				link.appendChild(document.createTextNode(jscard.links.url.uri));
				addProperty(tbody, 'Links', link);
			}
		}
		
		addProperty(tbody, 'Contact format', 'JSContact');
		
		return table;
	}
	
	// [수정] 내부 컨테이너를 dl → tbody+table로 변경
	function processJSCardAddress1(address) {
		var tbody = document.createElement('tbody');
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table.appendChild(tbody);
		
		for(const i in address.addr) {
			v = address.addr[i];
			if('street' == i) {
				var addr = document.createElement('span');
				for(var j = 0; i < v.length; j++) {
					if(j > 1) addr.appendChild(document.createElement('br'));
					addr.appendChild(document.createElement(v[j]));
				}
				addProperty(tbody, 'Street', addr);
			}else if('locality' == i) addProperty(tbody, 'City', v);
			else if('region' == i) addProperty(tbody, 'State/Province', v);
			else if('postcode' == i) addProperty(tbody, 'Postal Code', v);
			else if('countryCode' == i) addProperty(tbody, 'Country', v);
			else if('full' == i) addProperty(tbody, 'Full', v);
		}
		return table;
	}
	
	// [수정] 내부 컨테이너를 dl → tbody+table로 변경
	function processJSCardAddress(address) {
		var tbody = document.createElement('tbody');
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table.appendChild(tbody);
		
		for(i in address) {
			v = address[i];
			if('street' == i) {
				var addr = document.createElement('span');
				for(var j = 0; i < v.length; j++) {
					if(j > 1) addr.appendChild(document.createElement('br'));
					addr.appendChild(document.createElement(v[j]));
				}
				addProperty(tbody, 'Street', addr);
			}else if('locality' == i) addProperty(tbody, 'City', v);
			else if('region' == i) addProperty(tbody, 'State/Province', v);
			else if('postcode' == i) addProperty(tbody, 'Postal Code', v);
			else if('countryCode' == i) addProperty(tbody, 'Country', v);
			else if('full' == i) addProperty(tbody, 'Full', v);
		}
		return table;
	}
	
	// [수정] 내부 컨테이너를 dl → tbody+table로 변경
	function processVCardArray(vcard) {
		var tbody = document.createElement('tbody');
		var table = document.createElement('table');
		table.classList.add('table');
		table.setAttribute('style', 'margin-bottom: 0px; border-top: none;');
		table.appendChild(tbody);
		
		for(var i = 0; i < vcard.length; i++) {
			var node = vcard[i];
			
			var type = node[0];
			var value = node[3];
			
			if('version' == type) {
				continue;
			}else if('fn' == type) {
				type = 'Name';
			}else if('n' == type) {
				continue;
			}else if('org' == type) {
				type = 'Organization';
			}else if('tel' == type) {
				type = 'Phone';
				
				if(node[1].type) for(var j=0; j<node[1].type; j++) if('fax' == node[1].type[j]) {
					type = 'Fax';
					break;
				}
				
				var link = document.createElement('a');
				link.herf = (0 == value.indexOf('tel:')?'':'tel:') +value;
				link.appendChild(document.createTextNode(value));
				
				value = link;
			}else if('adr' == type) {
				type = 'Address';
				
				if(node[1].label) {
					var div = document.createElement('div');
					strings = node[1].label.split("\n");
					for(var j=0; j<strings.length; j++) {
						div.appendChild(document.createTextNode(strings[j]));
						if(j < strings.length - 1) div.appendChild(document.createElement('br'));
					}
					
					value = div;
					
				}else if(value) {
					var div = document.createElement('div');
					
					for(var j=0; j<value.length; j++) {
						if(value[j] && value[j].length > 0) {
							div.appendChild(document.createTextNode(value[j]));
							div.appendChild(document.createElement('br'));
						}
					}
					
					value = div;
				}
				
			}else if('email' == type) {
				type = 'Email';
				
				var link = document.createElement('a');
				link.href = 'mailto:' + value;
				link.appendChild(document.createTextNode(value));
				
				value = link;
				
			}else if('url' == type) {
				type = 'URL';
				
				var link = document.createElement('a');
				if(!/^https?:\/\//i.test(value)) {
					link.href = 'http://' + value;
				}else link.href = value;
				
				link.rel = "noopenner nofollow";
				link.target = "_blank";
				link.appendChild(document.createTextNode(value));
				value = link;
			}
			
			if(value) {
				if('Address' == type) {
					addPropertyBlock(tbody, type, value);
				} else {
					addProperty(tbody, type, value);
				}
			}
		}
		
		addProperty(tbody, 'Contact format', 'jCard');
		
		return table;
	}
	
	// process an AS number
	function processAutnum(object, dl, toplevel=false) {
		
		if(toplevel) document.title = changeLanguage('AS Number') + ' ' + object.handle + ' - RDAP Lookup';
		
		if(object.name) addProperty(dl, 'Network Name', object.name);
		if(object.type) addProperty(dl, 'Network Type', object.type);
		
		processCommonObjectProperties(object, dl, toplevel);
	}
	
	// process an IP or IP block
	function processIp(object, dl, toplevel=false) {
		if(toplevel) document.title = changeLanguage('IP Network') + ' ' + object.handle + ' - RDAP Lookup';
		
		if(object.ipVersion) addProperty(dl, 'IP Version', object.ipVersion);
		if(object.startAddress && object.endAddress) addProperty(dl, 'Address Range', object.startAddress + ' - ' + object.endAddress);
		if(object.name) addProperty(dl, 'Network Name', object.name);
		if(object.type) addProperty(dl, 'Network Type', object.type);
		if(object.country) addProperty(dl, 'Country', object.country);
		if(object.parentHandle) addProperty(dl, 'Parent Network', object.parentHandle);
		
		processCommonObjectProperties(object, dl, toplevel);
	}
	
	// given an object, return the "self" URL (if any)
	function getSelfLink(object) {
		if(object.links) for(var i=0; i<object.links.length;i++) if('self' == object.links[i].rel) return object.links[i].href;
		return null;	
	}
	
	// create an RDAP link: a link pointing to an RDAP URL
	// that when clicked, causes an RDAP query to be made
	function createRDAPLink(url, title) {
		var link = document.createElement('a');
		
		link.href = 'javascript:void(0)';
		link.href = title;
		link.title = url;
		link.onclick = new Function("runQuery('" + url + "', event)");
		
		link.appendChild(document.createTextNode(title));
		
		return link;
	}
	
	// guess the type from the input value
	function guessType(object) {
		var partterns = [
			[/^\d+$/, "autnum"],
			[/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/?(\d*)$/, "ip"],
			[/^[0-9a-f:]{2,}\/?(\d*)$/, "ip"],
			[/^[a-zA-Z0-9]{1}[a-zA-Z0-9\\-]{0,}[a-zA-Z0-9]{1}$/, "entity"],
			[/^https?:/, "url"],
			[/^{/, "json"],
			[ /^(([ㄱ-힣a-zA-Z0-9][ㄱ-힣a-zA-Z0-9\-]{0,61}){0,1}[ㄱ-힣a-zA-Z0-9]{1}(\.){1}){1,2}([ㄱ-힣a-zA-Z0-9][ㄱ-힣a-zA-Z0-9\-]{0,61}){0,1}[ㄱ-힣a-zA-Z0-9]{1}(\.)?$/,"domain"],
			[ /^(([ㄱ-힣a-zA-Z0-9][ㄱ-힣a-zA-Z0-9\-]{0,61}){0,1}[ㄱ-힣a-zA-Z0-9]{1}(\.){1}){3,}([ㄱ-힣a-zA-Z0-9][ㄱ-힣a-zA-Z0-9\-]{0,61}){0,1}[ㄱ-힣a-zA-Z0-9]{1}(\.)?$/,"nameserver"],
		];
		for(var i = 0; i < partterns.length; i++) {
			if(partterns[i][0].test(object)) {
				setType(partterns[i][1]);
				break;
			}
		}
	}
	
	// set the type of the object to be queried
	function setType(type) {
		var select = document.getElementById('type');
		for(var i = 0; i < select.options.length; i++) if(select.options.item(i).value == type) {
			select.selectedIndex = i;
			break;
		}
	}
	
	// check params of query string - called when page loads and when the back/forward buttons are used
	function checkParams() {
		var params = new URLSearchParams(window.location.search);
		
		if(params.has('type')) {
			setType(params.get('type'));
		}else if(params.has('object')) {
			guessType(params.get('object'));
		}
		
		if(params.has('object')) {
			document.getElementById('object').value = params.get('object');
			doQuery();
		}
	}
	
	function initiate() {
		let tooltips = document.querySelectorAll('[data-toggle="tooltip"]');
		for(let i = 0; i < tooltips.length; i++) {
			//let tooltip = new bootstrap.Tooltip(tooltips[i]);
		}
	}
	
	function makePanel(panel_type) { // primary, default, info, danger
		var div_panel = document.createElement('div');
		div_panel.classList.add('panel', 'panel-'+panel_type);
		div_panel.setAttribute('style', 'margin-bottom:10px;');
		return div_panel;
	}
	
	function makePanelHeading(cleckable, objectName, toplevel) {
		var div_panel_head = document.createElement('div');
		div_panel_head.classList.add('panel-heading');
		if(cleckable) {
			div_panel_head.classList.add('clickable');
			if(!toplevel) {
				div_panel_head.setAttribute('style', 'font-weight: bold; color: #222222;');
			}
			div_panel_head.setAttribute('id', objectName + 'Out');
			div_panel_head.setAttribute('data-toggle', 'collapse');
			div_panel_head.setAttribute('data-target', '.'+objectName + 'Print');
			div_panel_head.setAttribute('onclick', 'commonClick("'+objectName+'OutTD'+'")');
		}else{
			if(objectName) {
				div_panel_head.appendChild(document.createTextNode(objectName));
			}
		}
		return div_panel_head;
	}
	
	function makePanelBody(cleckable, objectName, toplevel) {
		var div_panel_body = document.createElement('div');
		div_panel_body.setAttribute('style', 'margin-bottom:0px;');
		div_panel_body.classList.add('panel-body');
		if(cleckable) {
			if(toplevel) div_panel_body.classList.add('collapse', 'in', objectName + 'Print');
			else div_panel_body.classList.add('collapse', objectName + 'Print');
		}
		
		return div_panel_body;
	}
	
	function makeHeadContent(titleText, objectName, toplevel) {
		if(!titleText) titleText = 'undefined'; 
		if(toplevel) {
			const headContent = '<table style="width:100%;color:#fff;"><tr><td width="90%"><b>'+titleText+'</b></td><td id="'+objectName+'OutTD'+'" style="text-align:right;color:#fff;">▲</td></tr></table>';
			return headContent;
		} else {
			const headContent = '<table style="width:100%"><tr><td width="90%"><b>'+titleText+'</b></td><td id="'+objectName+'OutTD'+'" style="text-align:right;">▼</td></tr></table>';
			return headContent;
		} 
	}
	
	function changeLanguage(word) {
		var lang = document.getElementById('lang').value;
		if(lang == '1') { // 1 is ko , 2 is en
			if (word == 'Domain') word = '도메인';
			else if (word == 'Nameserver') word = '네임서버';
			else if (word == 'AS Number') word = 'AS 번호';
			else if (word == 'IP Network') word = 'IP 주소';
			else if (word == 'Entity') word = '엔터티';
			
			
			else if (word == 'Host Name') word = '호스트 이름';
			else if (word == 'Internationalised Domain Name') word = 'IDN 이름(unicodeName)';
			else if (word == 'IP Address(v4)') word = 'IP 주소(v4)';
			else if (word == 'IP Address(v6)') word = 'IP 주소(v6)';
			else if (word == 'IP Version') word = 'IP 버전';
			else if (word == 'Network Name') word = '네트워크 이름';
			else if (word == 'Network Type') word = '네트워크 유형';
			else if (word == 'Address Range') word = '주소 범위';
			else if (word == 'Country') word = '국가';
			else if (word == 'Parent Network') word = '부모 네트워크';
			
			else if (word == 'Contact Information') word = '연락처 정보';
			else if (word == 'Contact format') word = '연락처 형식';
			else if (word == 'Organization') word = '조직';
			else if (word == 'Phone') word = '전화번호';
			else if (word == 'Fax') word = '팩스번호';
			else if (word == 'Address') word = '주소';
			else if (word == 'Email') word = '전자우편';
			else if (word == 'kind') word = '구분';
			else if (word == 'lang') word = '언어';
			
			else if (word == 'Roles') word = '역할(Roles)';
			else if (word == 'Handle') word = '고유 ID(Handle)';
			else if (word == 'Name') word = '이름';
			else if (word == 'ASCII Name') word = 'ASCII 이름';
			else if (word == 'Language') word = '언어';
			else if (word == 'Links') word = '링크';
			else if (word == 'Events') word = '이벤트 정보';
			else if (word == 'Status') word = '상태 정보';
			else if (word == 'Whois Server') word = '후이즈 서버';
			else if (word == 'Conformance') word = '적합성(Conformance)';
			else if (word == 'Nameservers') word = '네임서버 정보';
			else if (word == 'Networks') word = '네트쿼크 정보';
			else if (word == 'Entities') word = '엔터티 정보';
			else if (word == 'Remarks') word = '알 림(Remarks)';
			else if (word == 'Notices') word = '공지 정보';
			
			else if (word == 'This Object does not exist.') word = '이 객체는 존재하지 않습니다.';
			else if (word == 'Page not found') word = '페이지를 찾을 수 없음';
			else if (word == 'Timeout performing query, please try again later.') word = '조회 수행 중 시간 초과가 발생했습니다. 이후 다시 시도해 주시기 바랍니다.';
			
			else if (word == 'Full') word = '전체';
			else if (word == 'Localizations') word = '현지화 정보';
			else if (word == 'Kind') word = '구분';
			else if (word == 'Version') word = '버전';
		}
		
		return word;
	}
	
	function changeEventLanguage(word) {
		var lang = document.getElementById('lang').value;
		if(lang == '1') { // 1 is ko , 2 is en
			if (word == 'registration') word = '등록';
			else if (word == 'reregistration') word = '재등록';
			else if (word == 'last changed') word = '마지막 변경';
			else if (word == 'expiration') word = '만료';
			else if (word == 'deletion') word = '삭제';
			else if (word == 'reinstantiation') word = '재인스턴스화';
			else if (word == 'transfer') word = '이전';
			else if (word == 'locked') word = '잠금';
			else if (word == 'unlocked') word = '잠금 해제';
			else if (word == 'last update of RDAP database') word = '마지막 RDAP DB 반영';
			else if (word == 'registrar expiration') word = '등록기관 만료';
			else if (word == 'enum validation expiration') word = 'ENUM 유효성 검사 만료';
		}
		
		return word;
	}
	
	function makeSpineContent(objectName) {
			const headContent = '<table style="width:100%"><tr><td width="45%">&nbsp;</td><td id="'+objectName+'" width="10%" style="text-align:center;"></td><td width="45%"></td></tr></table>';
			return headContent; 
	}
	
	function freezeUI() {
		document.getElementById('type').disabled = true;
		document.getElementById('object').disabled = true;
		document.getElementById('button').disabled = true;
	}
	
	function thawUI() {
		document.getElementById('type').disabled = false;
		document.getElementById('object').disabled = false;
		document.getElementById('button').disabled = false;
	}
