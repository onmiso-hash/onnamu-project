
	/** =============================================
	Return : String
	Comment: sVal의 길이를 iLen으로 "0"으로 채워 맞춘 값을 리턴
	Usage  :
	---------------------------------------------- */
	function fn_setFillzeroByVal( sVal, iVal )
	{
		sStr = sVal + "";

		for (ii = sStr.length; ii < iVal; ii++) {
			sStr =  "0" + sStr;
		}

		return sStr;
	}


	/** =============================================
	Return : String
	Comment: sVal 앞자리에 0으로 채워진 값을 0제거후 숫자만 리턴
	Usage  :
	---------------------------------------------- */
	function fn_removeZeroByVal( sVal)
	{
		if (sVal == null)
		{
			return "";
		}

		var sStr = sVal + "";
		var flag = false;

		var ii = 0;

		while (!flag)
		{
			var ch = sStr.charAt(ii);
			if ( (ch == '0'))
			{
				if (ii < sStr.length)	ii++;
				else	flag = true;
			}else
				flag = true;
		}

		if (ii == (sStr.length))
			return "";
		else
			sStr = sStr.substring(ii);

		return sStr;

	}

	/** =============================================
	 * Time 스트링을 자바스크립트 Date 객체로 변환
	 * parameter time: Time 형식의 String
	---------------------------------------------- */
	function toTimeObject(time)
	{
	    var year  = time.substr(0,4);
	    var month = time.substr(4,2) - 1; // 1월=0,12월=11
	    var day   = time.substr(6,2);

	    return new Date(year,month,day);
	}

	/**
	 * 자바스크립트 Date 객체를 Time 스트링으로 변환
	 * parameter date: JavaScript Date Object
	 */
	function toTimeString(date)
	{
	    var year  = date.getFullYear();
	    var month = date.getMonth() + 1; // 1월=0,12월=11이므로 1 더함
	    var day   = date.getDate();

	    if (("" + month).length == 1) { month = "0" + month; }
	    if (("" + day).length   == 1) { day   = "0" + day;   }

	    return ("" + year + month + day )
	}

	/** =============================================
	 * 주어진 Time 과 y년 m월 d일 h시 차이나는 Time을 리턴
	 * ex) var time = form.time.value; //'20000101000'
	 *     alert(shiftTime(time,0,0,-100,0));
	 *     => 2000/01/01 00:00 으로부터 100일 전 Time
	---------------------------------------------- */
	function shiftTime(time,y,m,d)
	{
	    var date = toTimeObject(time);

	    date.setFullYear(date.getFullYear() + y); //y년을 더함
	    date.setMonth(date.getMonth() + m);       //m월을 더함
	    date.setDate(date.getDate() + d);         //d일을 더함

	    return toTimeString(date);
	}

	function divCheck(vDate1, vDate2, agencyid)
	{

		var vYear  ="";
		var vMonth ="";
		var vDay ="";

		if(agencyid =='krnic')
		{
			return true;
		}else
		{

			if(vDate1 !=null && vDate1 !=''&& vDate1.length==8)
			{
				vYear  = vDate1.substring(0,4);
				vMonth = vDate1.substring(4,6);
				vDay   = vDate1.substring(6,8);
			}

			var maxdate = fn_MaxdayYearMonth(vYear, vMonth);

			var addDate = shiftTime(vDate1, 0, 0, maxdate);

			if(Number(addDate) < Number(vDate2))
			{
				alert("검색조건에 날짜는 한달간격으로 설정하십시오!!");
				return  false;
			}
		}
		return  true;
	}


	/** =============================================
	Return : String (YYYYMMDD)
	Comment: 현재날자를 구한다 (문자:YYYYMMDD)
	Usage  :
	---------------------------------------------- */
	function fn_getDateNowToStr()
	{
		var dNow = new Date();
		var yyyy = "";
		var mm   = "";
		var dd   = "";

		yyyy = dNow.getYear();
		mm   = dNow.getMonth()+1;
		dd   = dNow.getDate();

		yyyy = fn_setFillzeroByVal( yyyy, 4 );
		mm   = fn_setFillzeroByVal( mm,   2 );
		dd   = fn_setFillzeroByVal( dd,   2 );
		return (yyyy + mm + dd);
	}

	/** =============================================
	Return : String (YYYY)
	Comment: 현재날자에 년를 구한다 (문자:YYYY)
	Usage  :
	---------------------------------------------- */
	function fn_getTodayYear()
	{
		var dNow = new Date();
		var yyyy = "";
		var mm   = "";
		var dd   = "";

		yyyy = dNow.getYear();
		mm   = dNow.getMonth()+1;
		dd   = dNow.getDate();

		yyyy = fn_setFillzeroByVal( yyyy, 4 );
		return yyyy;
	}

	/** =============================================
	Return : String (MM)
	Comment: 현재날자에 달를 구한다 (문자:MM)
	Usage  :
	---------------------------------------------- */
	function fn_getTodayMonth()
	{
		var dNow = new Date();
		var yyyy = "";
		var mm   = "";
		var dd   = "";

		yyyy = dNow.getYear();
		mm   = dNow.getMonth()+1;
		dd   = dNow.getDate();

		mm   = fn_setFillzeroByVal( mm,   2 );
		return mm;
	}


	/** =============================================
	Return : String (DD)
	Comment: 현재날자에 일자를 구한다 (문자:DD)
	Usage  :
	---------------------------------------------- */
	function fn_getTodayDate()
	{
		var dNow = new Date();
		var yyyy = "";
		var mm   = "";
		var dd   = "";

		yyyy = dNow.getYear();
		mm   = dNow.getMonth()+1;
		dd   = dNow.getDate();

		dd   = fn_setFillzeroByVal( dd,   2 );
		return dd;
	}


	/** =============================================
	Return : boolean
	Comment: 입력받은 년도가 윤년이면 true
	Usage  :
	---------------------------------------------- */
	function fn_isLeafYear(YYYY)
	{
		if ( ( (YYYY%4 == 0) && (YYYY%100 != 0) ) || (YYYY%400 == 0) ) {
			return true;
		}
		return false;
	}

	/** =============================================
	Return : int (해당 년,월의 날수)
	Comment: 입력받은 년,월의 최대 일을 구한다.
	Usage  :
	---------------------------------------------- */
	function fn_MaxdayYearMonth(yyyy, mm)
	{
		var monthDD = new Array(31,28,31,30,31,30,31,31,30,31,30,31);

		var iMaxDay = 0;

		if ( fn_isLeafYear(yyyy) ) {
			monthDD[1] = 29;
		}
		iMaxDay = monthDD[mm - 1];

		return iMaxDay;
	}


	/** =============================================
	Return : 년의 inner HTML을 리턴한다.
	Comment: 조건에 맞는년 combo box HTML을 생성.
	---------------------------------------------- */
	function fn_setYear(vSelectVal, vName, vScript, vMaxDate, vMinDate)
	{

		var setHtml = "";
		var sTodayYear = fn_getTodayYear();

		if( vMinDate == "" ) vMinDate = Number(sTodayYear) - 3;
		if( vMaxDate == "" ) vMaxDate = Number(sTodayYear);

		if( vMaxDate < vMinDate )
		{
			var tmp = vMaxDate;
			vMaxDate = vMinDate;
			vMinDate = tmp;
		}

		if(vScript !=null && vScript !="")  setHtml="<select name='"+ vName +"' "+ vScript +">";
		else                                setHtml="<select name='"+ vName +"'>";

		for(i=vMinDate; i<=vMaxDate; i++)
		{
			if( vSelectVal == i)  setHtml+="<option value='"+ i +"' selected >"+ i +"</option>";
			else                  setHtml+="<option value='"+ i +"'>"+ i +"</option>";
		}

		setHtml+="</select>";

		return setHtml;
	}


	/** =============================================
	Return : 달의 inner HTML을 리턴한다.
	Comment: 조건에 맞는 달 combo box HTML을 생성.
	---------------------------------------------- */
	function fn_setMonth(vSelectVal, vName, vScript, vMaxDate, vMinDate)
	{
		var setHtml = "";

		if( vMinDate == "" ) vMinDate = "1";
		if( vMaxDate == "" ) vMaxDate = "12";

		if( vMaxDate < vMinDate )
		{
			var tmp = vMaxDate;
			vMaxDate = vMinDate;
			vMinDate = tmp;
		}

		if(vScript !=null && vScript !="")  setHtml="<select name='"+ vName +"' "+ vScript +">";
		else                                setHtml="<select name='"+ vName +"'>";

		for(i=vMinDate; i<=vMaxDate; i++)
		{
			if( vSelectVal == i)  setHtml+="<option value='"+ fn_setFillzeroByVal(i,2) +"' selected >"+ i +"</option>";

			else                  setHtml+="<option value='"+ fn_setFillzeroByVal(i,2) +"'>"+ i +"</option>";
		}

		setHtml+="</select>";

		return setHtml;
	}


	/** =============================================
	Return : 일자의 inner HTML을 리턴한다.
	Comment: 조건에 맞는 일자 combo box HTML을 생성.
	---------------------------------------------- */
	function fn_setDay(vSelectVal, vName, vScript, vMaxDate, vMinDate)
	{
		var setHtml = "";

		if( vMinDate == "" ) vMinDate = "1";
		if( vMaxDate == "" ) vMaxDate = "31";

		if( vMaxDate < vMinDate )
		{
			var tmp = vMaxDate;
		 	vMaxDate = vMinDate;
			vMinDate = tmp;
		}

		if(vSelectVal > vMaxDate)
		{
			vSelectVal = vMaxDate;
		}

		if(vScript !=null && vScript !="")  setHtml="<select name='"+ vName +"' "+ vScript +">";
		else                                setHtml="<select name='"+ vName +"'>";

		for(i=vMinDate; i<=vMaxDate; i++)
		{
			if( vSelectVal == i)  setHtml+="<option value='"+ fn_setFillzeroByVal(i,2) +"' selected >"+ i +"</option>";
			else                  setHtml+="<option value='"+ fn_setFillzeroByVal(i,2) +"'>"+ i +"</option>";
		}

		setHtml+="</select>";

		return setHtml;
	}


	/** =============================================
	Return : 년월(yyyyMM)에 해당하는 최대일자을 리턴한다.
	Comment: 선택된 년월에 최대 일자를 구한다.
	---------------------------------------------- */
	function getMaxDate(vFlag)
	{
		var maxdate = "";
		var year    = "";
		var month   = "";

		var form = document.form1;
		if(vFlag == "from")
		{
			if(form.year_from == null)
				year = fn_getTodayYear();
			else year = form.year_from.value;

			if(form.month_from == null)
				month = fn_getTodayMonth();
			else month = form.month_from.value;

	    }else{

			if(form.year == null)
				year = fn_getTodayYear();
			else year = form.year.value;

			if(form.month == null)
				month = fn_getTodayMonth();
			else month = form.month.value;

		}

		//오늘날짜에 년, 월이 선택되었을때 오늘날짜에 date값을 max값으로 설정한다.
		if(year == fn_getTodayYear() &&  month == fn_getTodayMonth())
			maxdate = fn_removeZeroByVal(fn_getTodayDate());
		else
	    	maxdate = fn_MaxdayYearMonth(year,month);


	    return  maxdate;
	}


	/** =============================================
	Return :
	Comment: 년에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */

	function setYear_from(vYear)
	{
		var setHtml = fn_setYear(vYear, "year_from", "onChange='setDay_from();setMonth_from();'" , "", "");

		YEAR_FROM.innerHTML = setHtml;
	}


	/** =============================================
	Return :
	Comment: 달에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */

	function setMonth_from(vMonth)
	{
		var maxMonth = "";
		var form = document.form1;

		//오늘날짜에 년이 선택되었을때 오늘날짜에 달값을 max값으로 설정한다.
		if(form.year_from != null && form.year_from.value == fn_getTodayYear())
			maxMonth = fn_removeZeroByVal(fn_getTodayMonth());
		else
			maxMonth = "";

		//기존에 선택된 값을 설정한다.
		if(form.month_from != null) vMonth = form.month_from.value;

		var setHtml= fn_setMonth(vMonth, "month_from", "onChange='setDay_from();'", maxMonth, "");

		MONTH_FROM.innerHTML = setHtml;
	}

	/** =============================================
	Return :
	Comment: 일에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */
	function setDay_from(vDay)
	{
		var maxdate = getMaxDate("from");

		var form = document.form1;
		if(form.date_from != null) vDay = form.date_from.value;    //기존에 선택된 값을 설정한다.

		var setHtml = fn_setDay(vDay, "date_from", "", maxdate , "")

		DAY_FROM.innerHTML = setHtml;

	}

	//초기값 설정.
	function fn_init_from(vDate)
	{
		var vYear  ="";
		var vMonth ="";
		var vDay ="";

		if(vDate !=null && vDate !=''&& vDate.length==8)
		{
			vYear  = vDate.substring(0,4);
			vMonth = vDate.substring(4,6);
			vDay   = vDate.substring(6,8);
		}

		setYear_from(vYear);
		setMonth_from(vMonth);
		setDay_from(vDay);

	}
	/** =============================================
	Return :
	Comment: 년에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */
	function setYear_to(vYear)
	{
		var setHtml= fn_setYear(vYear, "year", "onChange='setDay_to();setMonth_to();'" , "", "");

		YEAR_TO.innerHTML = setHtml;
	}

	/** =============================================
	Return :
	Comment: 달에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */
	function setMonth_to(vMonth)
	{
		var form = document.form1;

		//오늘날짜에 년이 선택되었을때 오늘날짜에 달값을 max값으로 설정한다.
		if(form.year != null && form.year.value == fn_getTodayYear())
			maxMonth = fn_removeZeroByVal(fn_getTodayMonth());
		else
			maxMonth = "";

		//기존에 선택된 값을 설정한다.
		if(form.month != null) vMonth = form.month.value;

		var setHtml= fn_setMonth(vMonth, "month", "onChange='setDay_to();'", maxMonth, "");

		MONTH_TO.innerHTML = setHtml;
	}

	/** =============================================
	Return :
	Comment: 일에 combo box을 구하여 화면에 나타낸다.
	---------------------------------------------- */
	function setDay_to(vDay)
	{
		var maxdate   = getMaxDate("");

		var form = document.form1;
		if(form.date != null) vDay = form.date.value;    //기존에 선택된 값을 설정한다.

		var setHtml= fn_setDay(vDay, "date", "", maxdate , "")

		DAY_TO.innerHTML = setHtml;
	}


	//초기값 설정.
	function fn_init_to(vDate)
	{
		var vYear  ="";
		var vMonth ="";
		var vDay ="";

		if(vDate !=null && vDate !=''&& vDate.length==8)
		{
			vYear = vDate.substring(0,4);
			vMonth = vDate.substring(4,6);
			vDay = vDate.substring(6,8);
		}

		setYear_to(vYear);
		setMonth_to(vMonth);
		setDay_to(vDay);
	}


	/** =============================================
	Return : boolean
	Comment: combox의 체크유무 RETURN
	Usage  :
	---------------------------------------------- */
	function hasCheckedComBox(obj) {
		if (obj.options.length > 1) {
			for (var inx = 0; inx < obj.options.length; inx++) {
				if (obj[inx].selected) return true;
			}
		} else {
			if (obj.selected) return true;
		}
		return false;
	}

	/** =============================================
	Return :
	Comment: combo box에 있는 option들 중에 선택한 index값을 리턴한다.
	Usage  :
	---------------------------------------------- */
	function getIndexComboBox(obj)
	{
		var ret_val = "0";

		if(hasCheckedComBox(obj))
		{
			for( i=0; i<obj.options.length; i++)
			{
				if(obj.options[i].selected)
				{
					ret_val = i;
					return ret_val;
		        }
			}
		}
		return ret_val;
	}



	/** =============================================
	Return :
	Comment: combo box에 있는 option들 중에 선택한 index의 value값을 리턴한다.
	Usage  :
	---------------------------------------------- */
	function setValueComboBox(obj)
	{
		var inx = getIndexComboBox(obj);

		return fn_trim(obj.options[inx].value);
	}

	/** =============================================
	Return :
	Comment: combo box에 있는 option들 중에 선택한 index의 Text값을 리턴한다.
	Usage  :
	---------------------------------------------- */
	function setTextComboBox(obj)
	{
		var inx = getIndexComboBox(obj);

		return fn_trim(obj.options[inx].text);
	}



	/** =============================================
	Return :
	Comment: combo box에 있는 option들 중에 선택하고자 하는 값에 포커스를 맞춘다.
	Usage  :
	---------------------------------------------- */
	function setComboBox(obj, selectedOption)
	{
		if(hasCheckedComBox(obj))
		{
			for( i=0;i < obj.options.length;i++)
			{
				if (obj.options[i].value == selectedOption)
				{
					obj.selectedIndex=i;
					break;
				}
			}
		}
	}

	// null check
	function null_check(obj)
	{
		if(obj.value == "")
			return true;
	}


	/** =============================================
	Return : boolean
	Comment: 라디오버튼의 체크유무 RETURN
	Usage  :
	---------------------------------------------- */
	function hasCheckedRadio(obj) {
		if (obj.length > 1) {
			for (var inx = 0; inx < obj.length; inx++)
		{
				if (obj[inx].checked) return true;
			}
		} else {
			if (obj.checked) return true;
		}
		return false;
	}

	/** =============================================
	Return : String
	Comment: 라디오버튼의 체크값을 RETURN (단, 체크하지 않았을 경우 "0"리턴)
	Usage  :
	---------------------------------------------- */
	function retValueRadio(obj) {

		var ret_val = "0";
		if(hasCheckedRadio(obj))
		{
			for (var inx = 0; inx < obj.length; inx++)
			{
				if (obj[inx].checked)
				{
					ret_val = obj[inx].value;
					return ret_val;
				}
			}
		}

		if(obj.value=="undefined")
		{
			return ret_val;

		}

		return ret_val;

	}


	/** =============================================
	Return : String
	Comment: 라디오버튼의 체크값된 index를 리턴(단, 체크하지 않았을 경우 "0"리턴)
	Usage  :
	---------------------------------------------- */
	function retIndexRadio(obj) {

		var ret_index = "0";
		if(hasCheckedRadio(obj))
		{
			for (var inx = 0; inx < obj.length; inx++)
			{
				if (obj[inx].checked)
				{
					return inx;
				}
			}
		}

		if(obj.value=="undefined")
		{
			return ret_index;

		}

		return ret_index;

	}


	/** =============================================
	Return :
	Comment: 라디오버튼에 있는 선택하고자 하는 값에 포커스를 맞춘다.
	Usage  :
	---------------------------------------------- */
	function setRadioBox(obj, selectedOption)
	{
		for( i=0;i < obj.length;i++)
		{
			if(selectedOption=='')
			{
				obj[0].checked=true;
				break;

			}else{
				if (obj[i].value == selectedOption)
				{
					obj[i].checked=true;
					break;
				}

			}

		}
	}

	/** =============================================
	Return :
	Comment: sMsg 를 경고창에 띄우고, obj 로 포커스를 이동한다.
	Usage  :
	---------------------------------------------- */
	function fn_MsgPopFocus(obj, sMsg)
	{
		alert(sMsg);
		fn_focus(obj); //obj.focus();
	}

	/** =============================================
	Return : boolean (Yes: true)
	Comment: sMsg 를 경고창에 띄워 Yes / No 로 묻고, obj 로 포커스를 이동한다.
	Usage  :
	---------------------------------------------- */
	function fn_confirmFocus(obj, sMsg)
	{
		var isTrue = false;

		isTrue = confirm(sMsg);
		fn_focus(obj); //obj.focus();

		return isTrue;
	}

	/** =============================================
	Return :
	Comment: 인수로 받은 객체로 포커스를 이동한다.
	Usage  : onKeyPress="fn_focus(NextObj, isNextObjSelection)"
	---------------------------------------------- */
	function fn_focus(objTo, bSelection)
	{
		// 속성: .disabled, .readonly, .enabled, .visible
		// 속성이 지정되지 않은 경우를 주의할것! 2001-02-10
		if ( ((objTo.readonly == null) || (objTo.readonly != null && objTo.readonly == false)) &&
			 ((objTo.disabled == null) || (objTo.disabled != null && objTo.disabled == false)) &&
			 ((objTo.visible  == null) || (objTo.visible  != null && objTo.visible  == true )) &&
			 ((objTo.enabled  == null) || (objTo.enabled  != null && objTo.enabled  == true )) ) {
			objTo.focus();

			if (!(bSelection == false))
				bSelection = true;

			if ( (bSelection) && objTo.isTextEdit )
				objTo.select();
		}
		return;
	}

	/** =============================================
	Return : String
	Comment: 입력받은 text 의 앞뒤에 붙은 Space, Tab, CRLF 를 제거
	Usage  :
	---------------------------------------------- */
	function fn_trim(text)
	{
		if (text == null) {
			return "";
		}

		var txt = text + "";
		var flag = false;

		// 앞쪽 트림
		var ii = 0;

		while (!flag) {
			var ch = txt.charAt(ii);
			if ( (ch == ' ') || (ch == '\t') || (ch == '\n') || (ch == '\r') ) {
				if (ii < txt.length)
					ii++;
				else
					flag = true;
			} else
				flag = true;
		}

		if (ii == (txt.length))
			return "";
		else
			txt = txt.substring(ii);

		// 뒤쪽 트림
		flag = false;
		var jj = txt.length - 1;

		while (!flag) {
			var ch = txt.charAt(jj);
			if ( (ch == ' ') || (ch == '\t') || (ch == '\n') || (ch == '\r') ) {
				if ( jj > 0 )
					jj--;
				else
					flag = true;
			} else
				flag = true;
		}

		txt = txt.substring(0, jj+1);
		return txt;
	}


	/** =============================================
	Return : String
	Comment: 입력받은 text 의 앞뒤에 붙은 Space, Tab, CRLF 를 제거
	Usage  :
	---------------------------------------------- */
	function fn_trimByObj(obj)
	{
		obj.value = fn_trim(obj.value);
	}

	// event.shiftKey : 키코드값
	// event.shiftKey, event.altKey, event.ctrlKey : boolean
	// event.srcElement : 이벤트가 발생된 객체
	// 8: BackSpace, 46: Del
	// ","=44, "-"=45, "."=46, "/"=47
	// "0"=48, "9"=57
	// "@"=64, "A"=65, "Z"=90, "a"=97, "z"=122
	// 37:LeftArrow, 38:UpArrow, 39:RightArrow, 40:DownArrow **
	/** =============================================
	Return : event.returnValue = boolean
	Comment: 키입력시 숫자만 입력 받게 한다.
	Usage  : onKeyDown="fn_onKeyOnlyNumber();"
	---------------------------------------------- */
	function fn_onKeyOnlyNumber()
	{
		var sValid = "0123456789";

		var sValue = event.srcElement.value;
		var iKey = event.keyCode;
		var isShift = event.shiftKey;
		var isMove = false;
		var isCut  = false
		var isTrue = true;

		event.srcElement.style.imeMode = "inactive"; //style.imeMode(active:한글, inactive:영문) 그러나, 동적으로는 반영 안된다. (html tag의 style="IME-MODE:inactive;" 로 지정하여야만..)

		var sReturnValue = "";
		for (var ii=0; ii < sValue.length; ii++)
		{
			if (sValid.indexOf(sValue.substring(ii, ii+1)) >= 0)
			{
				sReturnValue = sReturnValue + sValue.substring(ii, ii+1);
			}
		}

		if ( (iKey == 37 || iKey == 38 || iKey == 39 || iKey == 40) ||
			 (iKey == 13 || iKey == 8  || iKey == 46 || iKey == 9  || iKey == 16  || isShift) ||
			 (iKey >= 48 && iKey <= 57) ||
			 (iKey >= 96 && iKey <= 105) )
		{
			for (var ii=0; ii < sValue.length; ii++)
			{
				if (sValid.indexOf(sValue.substring(ii, ii+1)) < 0)
				{
					event.returnValue = false;
					isCut  = true;
					isTrue = false;
					break;
				}
			}
		}else {
			event.returnValue = false;
			isTrue = false;
		}

		if (isCut || isTrue == false)
			event.srcElement.value = sReturnValue;

		if (iKey == 13) {
			event.keyCode = 0;
			return sReturnValue;
		} else {
			return sReturnValue;
		}
	}


	//엔터키입력시 포커스세팅
	var isNav4, isIE4
	if (parseInt(navigator.appVersion.charAt(0)) >= 4)
	{
		isNav4 = (navigator.appName == "Netscape") ? true : false
		isIE4 = (navigator.appName.indexOf("Microsoft" != -1)) ? true : false
	}

	function chkWhich(evt)
	{
		var theKey;
		if (isNav4) {
		   theKey = evt.which;
		} else if (isIE4) {
		   if (window.event.srcElement.type == "password" || window.event.srcElement.type == "text") {
		      theKey = window.event.keyCode;
		   }
		}
        return theKey;
	}

	/** =============================================
	Return : boolean
	Comment: E-mail 주소 체크 함수
	Usage  :
	---------------------------------------------- */
	function fn_isEmail(email_addr)
	{
		if (email_addr == "") return false;

		var t = email_addr;

		var Alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		var Digit = '1234567890';
		var Symbol='_-';
		var check = '@.' + Alpha + Digit + Symbol;

		for (i=0; i < t.length; i++)
			if(check.indexOf(t.substring(i,i+1)) < 0)    {
				return false;
			}

		var check = '@';
		var a = 0;
		for (i=0; i < t.length; i++)
			if(check.indexOf(t.substring(i,i+1)) >= 0)    a = i;

		var check = '.';
		var b = 0;

		for (i=a+1; i < t.length; i++)
			if(check.indexOf(t.substring(i,i+1)) >= 0)  b = i;

		if (a != 0 && b != 0 && b!=t.length-1 )
		{
			return true;
		} else {
			return false;
		}
	}

	//checkbox에 값 세팅
	function setCheckbox(form, type)
	{
		for(i = 0; i <  form.elements.length; ++i)
		{
			if(form.elements[i].type == 'checkbox' && form.elements[i].disabled == false)
			{
	        	if(type)
					form.elements[i].checked = true;
	        	else
					form.elements[i].checked = false;

			}
		}
	}


	/** =============================================
	Return : boolean
	Comment: 전화번호(DDD, 국번, 번호 등을 입력 받아 유효한 전화번호인경우 각 번호를 4자리로 채워 맞춘다
	Usage  :
	---------------------------------------------- */
	function fn_isPhoneByObj( objAreaNo, objCallNo, objTelNo, bFillZeros )
	{
		var isTrue = false;
		var sAreaNo = objAreaNo.value + "";
		var sCallNo = objCallNo.value + "";
		var sTelNo  = objTelNo.value  + "";

		if (sAreaNo == "" && sCallNo == "" && sTelNo == "")
		{
			isTrue = true;

		} else {
			// **주의**
			// parseInt : 첫 문자가 숫자가 아닌('0'포함) 경우 NaN을 리턴
			// isNaN    : 정수값이 아니면 true
			// 위의 이러한 사항 때문에 parseInt(문자형숫자값 * 1)를 먼저 수행해야만 한다.
			var iAreaNo = parseInt(sAreaNo * 1);
			var iCallNo = parseInt(sCallNo * 1);
			var iTelNo  = parseInt(sTelNo  * 1);
			if ( ( !isNaN(iAreaNo) && !isNaN(iCallNo) && !isNaN(iTelNo) ) &&
				 ( iAreaNo ==  2 /* 서울 */ ||
				   iAreaNo == 31 /* 경기 */ ||
				   iAreaNo == 32 /* 인천 */ ||
				   iAreaNo == 33 /* 강원 */ ||
				   iAreaNo == 41 /* 충남 */ ||
				   iAreaNo == 42 /* 대전 */ ||
				   iAreaNo == 43 /* 충북 */ ||
				   iAreaNo == 51 /* 부산 */ ||
				   iAreaNo == 52 /* 울산 */ ||
				   iAreaNo == 53 /* 대구 */ ||
				   iAreaNo == 54 /* 경북 */ ||
				   iAreaNo == 55 /* 경남 */ ||
				   iAreaNo == 61 /* 전남 */ ||
				   iAreaNo == 62 /* 광주 */ ||
				   iAreaNo == 63 /* 전북 */ ||
				   iAreaNo == 64 /* 제주 */ ||
				   iAreaNo == 11 /* 011  */ ||
				   iAreaNo == 16 /* 016  */ ||
				   iAreaNo == 17 /* 017  */ ||
				   iAreaNo == 18 /* 018  */ ||
				   iAreaNo == 19 /* 019  */ ) &&
				 ( iCallNo >= 10 && iCallNo <= 9999 ) &&
				 ( iTelNo  >= 1  && iTelNo  <= 9999 ) )
			{
				isTrue = true;
				if (bFillZeros || bFillZeros == null)
				{
					objAreaNo.value = fn_setFillzeroByVal( objAreaNo.value, 4 );
					objCallNo.value = fn_setFillzeroByVal( objCallNo.value, 4 );
					objTelNo.value  = fn_setFillzeroByVal( objTelNo.value,  4 );
				} else {
					objAreaNo.value = "0"+ iAreaNo;
				}
			}
		}

		return isTrue;
	}

	/** =============================================
	Return : boolean
	Comment: 전화번호 주소 체크 함수
	Usage  :
	---------------------------------------------- */
	function phone_check(obj1, obj2, obj3)
	{

		if(null_check(obj1))
		{
			fn_MsgPopFocus(obj1, '전화번호를 정확히 입력하세요.');
			return false;
		}

		if(null_check(obj2))
		{
			fn_MsgPopFocus(obj2, '전화번호를 정확히 입력하세요.');
			return false;
		}

		if(null_check(obj3))
		{
			fn_MsgPopFocus(obj3, '전화번호를 정확히 입력하세요.');
			return false;
		}

		if(obj2.value.length < 3)
		{
			fn_MsgPopFocus(obj2, '유효하지 않은 번호입니다..');
			return false;

		}
		if(obj3.value.length < 4)
		{
			fn_MsgPopFocus(obj3, '유효하지 않은 번호입니다.');
			return false;

		}

		if(!fn_isPhoneByObj(obj1, obj2, obj3, false))
		{
			fn_MsgPopFocus(obj1, '유효하지 않은 번호입니다.');
			return false;
		}

		return true;
	}


	/** =============================================
	Return : boolean
	Comment: .한국도메인 신청, 등록 테스트용
	Usage  :
	---------------------------------------------- */
    function commonValidation(f)
    {
        if (f.IN_CompanyName != null) {
            if (null_check(f.IN_CompanyName)) {
                fn_MsgPopFocus(f.IN_CompanyName, "기관명을 입력하십시오.");
                return false;
            }
        }
        if (f.IN_CompanyEname != null) {
            if (null_check(f.IN_CompanyEname)) {
                fn_MsgPopFocus(f.IN_CompanyEname, "기관영문명을 입력하십시오.");
                return false;
            }
        }
        if (f.IN_ContactName != null) {
            if (null_check(f.IN_ContactName)) {
                fn_MsgPopFocus(f.IN_ContactName, "책임자명을 입력하십시오.");
                return false;
            }
        }
        if (f.IN_ContactEname != null) {
            if (null_check(f.IN_ContactEname)) {
                fn_MsgPopFocus(f.IN_ContactEname, "책임자영문명을 입력하십시오.");
                return false;
            }
        }
        if (f.IN_ZipCode != null) {
            if (null_check(f.IN_ZipCode)) {
                fn_MsgPopFocus(f.IN_ZipCode, "우편번호를 입력하십시오.");
                return false;
            }
        }
        if (f.IN_Addr1 != null) {
            if (null_check(f.IN_Addr1)) {
                fn_MsgPopFocus(f.IN_Addr1, "주소를 입력하십시오.");
                return false;
            }
        }
        if (f.IN_Addr2 != null) {
            if (null_check(f.IN_Addr2)) {
                fn_MsgPopFocus(f.IN_Addr2, "상세 주소를 입력하십시오.");
                return false;
            }
        }
        if (f.IN_Eaddr1 != null) {
            if (null_check(f.IN_Eaddr1)) {
                fn_MsgPopFocus(f.IN_Eaddr1, "영문주소를 입력하십시오.");
                return false;
            }
        }
        if (f.IN_Eaddr2 != null) {
            if (null_check(f.IN_Eaddr2)) {
                fn_MsgPopFocus(f.IN_Eaddr2, "영문 상세주소를 입력하십시오.");
                //return false;
            }
        }
        if (f.IN_TelNo != null) {
            if (null_check(f.IN_TelNo)) {
                fn_MsgPopFocus(f.IN_TelNo, "전화번호를 입력하십시오.");
                return false;
            }
        }
        if (f.IN_EMail != null) {
            if (null_check(f.IN_EMail)) {
                fn_MsgPopFocus(f.IN_EMail, "E-Mail를 입력하십시오.");
                return false;
            }
        }

        if (f.IN_ContractTerm != null) {
            if (null_check(f.IN_ContractTerm)) {
                fn_MsgPopFocus(f.IN_ContractTerm, "계약기간을 입력하십시오.");
                return false;
            }
        }
        return true;
    }

	/** =============================================
	Return : - 
	Comment: RDAP(Server-side) Event Data 변환 및 재설정
	Usage  :
	---------------------------------------------- */
	function spanDateChange(spanID, dateStr) {
		document.getElementById(spanID).innerHTML = fn_toLocaleTime(dateStr);
	}
	/** =============================================
	Return : string 변환된 문자열 반환
	Comment: RDAP(Server-side) Event Data 변환
	Usage  :
	---------------------------------------------- */
	function fn_toLocaleTime(dateTime) {
		var dateText = '';
		var lang = document.getElementById('lang').value;
		const dateOptions={
			year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', seconds: '2-digit', timeZoneName:"short", hour12: false
		};
		if(lang == '2') dateText = new Date(dateTime).toLocaleString('en-US', dateOptions);
		else{
			dateText = new Date(dateTime).toLocaleString( undefined, dateOptions );
		}
		return dateText;
	}
