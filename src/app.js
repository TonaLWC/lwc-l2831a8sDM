import {
	LightningElement,
	wire,
	api
} from 'lwc';
import FORM_FACTOR from '@salesforce/client/formFactor'
import {
	getObjectInfo,
	getPicklistValues
} from 'lightning/uiObjectInfoApi';
import CALL_LOCATOR_OBJECT from '@salesforce/schema/CP_CallLocator__c';
import phoneTypeField from '@salesforce/schema/CP_CallLocator__c.tipotelefono__c';
import bestHoursField from '@salesforce/schema/CP_CallLocator__c.CP_BestHourToCall__c';
import picklistValuesInfo from '@salesforce/apex/InteractionHandlerController.picklistValuesInfo';
import getCurrentAccountCall from '@salesforce/apex/InteractionHandlerController.customerInfo';
import manualcustomerInfo from '@salesforce/apex/InteractionHandlerController.manualcustomerInfo';
import checkPlatformCache from '@salesforce/apex/InteractionHandlerController.getCacheValues';
import customerRelatedInfo from '@salesforce/apex/InteractionHandlerController.customerRelatedInfo';
import updateContactInfo from '@salesforce/apex/InteractionHandlerController.updateContactData';
import removeCache from '@salesforce/apex/InteractionHandlerController.removeKeyCache';
import {
	ShowToastEvent
} from 'lightning/platformShowToastEvent';
import {
	reduceErrors
} from 'c/ldsUtils';
import {
	createPicklistWhoAnswer,
	picklistEndOfCallStep1,
	picklistEndOfCallStep2,
	reasonNonCompliance,
	columnsCredit,
	columnsTask,
	columnsCases
} from 'c/interactionHandlerUtils';
import createTask from '@salesforce/apex/InteractionHandlerController.createTaskStep1';
import createTaskStep2 from '@salesforce/apex/InteractionHandlerController.createTaskStep2';
import newAgreement from '@salesforce/apex/InteractionHandlerController.newAgreement';
import endCallWithException from '@salesforce/apex/InteractionHandlerController.endCallWithException';
import messageNotResponding from '@salesforce/label/c.CP_MessageNotResponding';
export default class InteractionHandler extends LightningElement {

	messageNotResponding = messageNotResponding;
	// Bandera para indicar si hay llamada
	isCurrentCall = false;
	// Bandera para indicar fin de llamada en la pantalla 1
	isEndingCall = false;
	// Banderas para controlar la visibilidad de cada pantalla
	stepOne = false;
	stepTwo = false;
	stepThree = false;
	// Label para el boton en paso 1
	labelButtonStep1 = 'Continuar';
	// Bandera para guardar si tenemos convenio
	existConvenioDesktop = false;
	// Objeto para almacenar el resultado la query de la llamada actual
	callInfo;
	// Variable para guardar el valor de quien contesto.
	whoAnsweredStep = '0';
	// Controlar el spiner
	isLoadingSpinner = false;
	// Objeto para guardar la información relacionada al cliente
	relatedInfo;
	// Objeto para guardar info del ultimo convenio
	lastAgreement;
	// Variable para establecer el plazo maximo
	maxPlazoAvailable;
	// Variable para establecer el plazo maximo
	minPlazoAvailable;
	// Variable para calcular el monto pendiente de pagar
	pendingValue;

	// Almacena el valor de fin de llamada
	endOfCallValue = '';
	// Almacena el valor de fin de llamada
	endOfCallLabel = '';

	// razon no cumplio
	reasonNonComplianceValue = '';

	// Establecemos las columnas de la tabla de articulos
	columnsCredit = columnsCredit;
	// Establecemos las columnas de la tabla de historial de llamadas
	columnsTask = columnsTask;
	// Establecemos las columnas de la tabla de quejas abiertas
	columnsCases = columnsCases;
	// Arreglo con valores de articulos
	dataCredit = [];
	// Arreglo con valores de historial de llamadas
	dataTask = [];

	// array who Answer
	whoAnsweredData = [];

	// array fin de llamada pantalla 1
	endOfCallScreenOne = [];
	// array fin de llamada pantalla 2
	endOfCallScreenTwo = [];
	// array razones no cumplió
	reasonNonComplianceOptions = [];


	//Secciones activas en el componente (Acordeon)
	activeSectionsStep2 = ['A', 'B', 'C', 'D'];

	// Este valor se rellena desde uCOntact (recibe uContact)
	@api isUcontact = false;
	// Este valor se rellena desde uCOntact (recibe el empleado)
	@api employeeNumber = null;
	// Bandera para controlar si la llamada fue terminada
	callWasEnded;
	// para saber si en el picklist de razon de inc. selecciona el valor otros
	activeInputOtros = false;
	valueOtrosReasonNonComp;
	// boolean para controlar cuando mostrar el picklist de horas
	activeBestHours = false;
	// guardar mejor hora
	valueBestHours;
	// variable para setear sitiene quejas
	hasCase = false;
	// variable para setear sitiene quejas
	lastObservation;

	//timer consultaCache
	cacheTimerCallActive;

	cacheTimerCallInactive;

	//timer consultaCache
	@api callLocatorIdentifier;
	// si tenemos casos abiertos
	hasOpenCasesCurrently;
	// para guardar la tarea guardada
	taskStep2;
	//Max value amount convenio
	maxValueAgreement;
	//bandera para controlar el inicio de cuenta regresiva
	isEventEndOfCallFired = false;

	// Variable para calcular el color de fondo del card
	get setColorCard() {
		if (this.stepOne || this.stepTwo || this.stepThree) {
			return 'colorCardWhite';
		} else {
			return 'colorCardGray';
		}
	}

	// Wire para obtener los valores de picklist
	@wire(picklistValuesInfo)
	picklistValues({
		data,
		error
	}) {
		if (data) {
			this.whoAnsweredData = createPicklistWhoAnswer(FORM_FACTOR, data.whoAnswered);

			this.endOfCallScreenOne = picklistEndOfCallStep1(data.endOfCall);

			this.endOfCallScreenTwo = picklistEndOfCallStep2(data.endOfCall);

			this.reasonNonComplianceOptions = reasonNonCompliance(FORM_FACTOR, data.reasonNonCompliance);
		} else if (error) {
			console.log(error);
		}
	}
	// Wire para obtener la informacion del objeto callLocator
	@wire(getObjectInfo, {
		objectApiName: CALL_LOCATOR_OBJECT
	})
	callLocatorInfo;
	// Wire para obtener los valores del picklist tipo de telefono
	@wire(getPicklistValues, {
		recordTypeId: '$callLocatorInfo.data.defaultRecordTypeId',
		fieldApiName: phoneTypeField
	})
	phoneTypesValues;

	// Wire para obtener los valores del picklist tipo de telefono
	@wire(getPicklistValues, {
		recordTypeId: '$callLocatorInfo.data.defaultRecordTypeId',
		fieldApiName: bestHoursField
	})
	bestHoursValues;

	connectedCallback() {
        // Solo si es diferente a uContact ejecuta el cache
		if (!this.isUcontact) {
			this.checkCache();
		}
	}
	disconnectedCallback() {
		clearInterval(this.cacheTimerCallActive);
		clearInterval(this.cacheTimerCallInactive);
	}
    // Consulta la platform cache cada segundo
	checkCache(event) {
		clearInterval(this.cacheTimerCallInactive);
		this.cacheTimerCallActive = setInterval(() => {
			checkPlatformCache()
				.then((call) => {
					const cacheResult = JSON.parse(call);
					if (call != 'null' && cacheResult.callLocatorId != ''){
						clearInterval(this.cacheTimerCallActive);
						this.callLocatorIdentifier = cacheResult.callLocatorId;
						this.getCurrentCall();
					}
				})
				.catch((error) => {
					console.log(error);
					clearInterval(this.cacheTimerCallActive);
				});
		}, 1000);
	}
    //Consulta la platform cache cada 5 seg y ve si cambia el valor
	checkCacheIsInactive(event) {
		this.cacheTimerCallInactive = setInterval(() => {
			checkPlatformCache()
				.then((call) => {
					const cacheResult = JSON.parse(call);
					if (call != 'null'){
						if(cacheResult.callLocatorActive == 'false' && cacheResult.blocking == 'false'){
							if(!this.isEventEndOfCallFired){
								this.dispatchEvent(new CustomEvent('endedcall', {
									detail: this.callInfo.call.CP_QueueId__c
								}));
							    this.isEventEndOfCallFired = true;
							}
						}
						if(cacheResult.callLocatorActive == 'false' && cacheResult.blocking =='true'){
							clearInterval(this.cacheTimerCallInactive);
							this.showToastFuntion("Llamada", "warning", messageNotResponding, "sticky");
							this.removeCurrentCache();
							this.resetInitialStep();
							this.cleanStorage();
						}
					}
				})
				.catch((error) => {
					console.log(error);
					clearInterval(this.cacheTimerCallInactive);
				});
		}, 5000);
	}


	// Metodo decorado con el valor api, este metodo lo invoca genesys y uContact
	@api
	getCurrentCall(event) {
		this.isLoadingSpinner = true;
		getCurrentAccountCall({
				callLocatorId: this.callLocatorIdentifier
			})
			.then((result) => {
				this.callInfo = result;
				this.isCurrentCall = true;
				this.stepOne = true;
				this.stepTwo = false;
				this.isLoadingSpinner = false;
				this.maxValueAgreement = this.callInfo.customer.CP_TotalDebt__c;
				if (!this.isUcontact) {
					this.dispatchEvent(new CustomEvent('timerinit', {
						detail: this.callInfo.call.CreatedDate
					}));
					this.checkCacheIsInactive();
				}
			})
			.catch((error) => {
				console.log(error);
				this.isLoadingSpinner = false;
			});
	}
    //Metodo para obtener la llamada de forma manual
	getManualCurrentCall() {
		this.isLoadingSpinner = true;
		manualcustomerInfo()
			.then((result) => {
				this.callInfo = result;
				this.isCurrentCall = true;
				this.stepOne = true;
				this.stepTwo = false;
				this.isLoadingSpinner = false;
				clearInterval(this.cacheTimerCallActive);
				this.maxValueAgreement = this.callInfo.customer.CP_TotalPassToPay__c;
				if (!this.isUcontact) {
					this.dispatchEvent(new CustomEvent('timerinit', {
						detail: this.callInfo.call.CreatedDate
					}));
					this.checkCacheIsInactive();
				}
			})
			.catch((error) => {
				this.showToastFuntion("Llamada", "warning", "No tiene llamadas actualmente", "");
				this.isLoadingSpinner = false;
			});
	}

	// Metodo quien atiende la llamada, desde la pantalla 1
	whoAttends(event) {
		const currentValue = event.target.value;
		this.whoAnsweredStep = currentValue;
		// Si es uno de estos valores cambiamos seteamos valores para preparar el fin de llamada
		if (currentValue == 'NLC' || currentValue == 'N' || currentValue == 'NLI' || currentValue == 'LCNF') {
			this.isEndingCall = true;
			this.labelButtonStep1 = 'Finalizar Llamada';
		} else {
			this.isEndingCall = false;
			this.labelButtonStep1 = 'Continuar';
		}
	}

	// Guardamos o capturamos la actualizacion del valor quien contesto desde la pantalla
	whoAttendsStep2(event) {
		this.whoAnsweredStep = event.target.value;
	}

	// Guardamos o capturamos la actualizacion del valor quien contesto desde la pantalla
	onchangeBestHours(event) {
		this.valueBestHours = event.target.value;
	}

	// metodo cuando se presiona el boton continuar en pantalla 1
	onclickStepOne(event) {
		const isValidStep1 = [...this.template.querySelectorAll('.classWhoAttendStep1,.classEndOfCallStep1,.classBestHourStep1')]
			.reduce((validSoFar, inputCmp) => {
				inputCmp.reportValidity();
				return validSoFar && inputCmp.checkValidity();
			}, true);
		if (isValidStep1) {
			if (this.stepOne && this.isEndingCall) {
				this.closeCallStep1();
			} else {
				this.getInfoRelatedToAccount();
			}
		}
	}
    //Metodo se invoca desde el lwc statusManagerHandler si se cumple el tiempo de espera
	@api
	automaticClosure(event) {
		this.whoAnsweredStep = 'N';
		this.endOfCallValue = '25';
		this.endOfCallLabel = 'Colgó';
		this.closeCallStep1();
	}
    //Metodo para terminar la llamada en la primer pantalla
	closeCallStep1(event) {
		this.isLoadingSpinner = true;
		let taskParams = {
			WhatId: this.callInfo.customer.Id,
			CP_WhoAnswered__c: this.whoAnsweredStep,
			CP_EndOfCall__c: this.endOfCallValue,
			CallDisposition: this.endOfCallLabel,
			CallObject: this.callInfo.call.CP_CTIPlatform__c,
			CP_BestHourToCall__c: this.valueBestHours,
			CP_CallId__c: this.callInfo.call.pkwhere__c,
			OwnerId: this.callInfo.call.CP_SalesforceEmployee__c,
			CP_Dunning__c: this.callInfo.call.CP_Dunning__c
		};
		let callLocator = {
			Id: this.callInfo.call.Id,
			CP_CTIPlatform__c: this.callInfo.call.CP_CTIPlatform__c,
			finllamada__c: this.endOfCallValue,
			pkwhere__c: this.callInfo.call.pkwhere__c,
			CP_PlatformParticipantId__c: this.callInfo.call.CP_PlatformParticipantId__c,
			CP_QueueId__c: this.callInfo.call.CP_QueueId__c,
			CP_GenesysAgentToken__c: this.callInfo.call.CP_GenesysAgentToken__c,
			CP_BestHourToCall__c: this.valueBestHours,
			fechahorallamada__c: this.callInfo.call.fechahorallamada__c
		};
		createTask({
				newTask: taskParams,
				currentCall: callLocator
			})
			.then((result) => {
				this.isCurrentCall = false;
				this.isEndingCall = false;
				this.isLoadingSpinner = false;
				this.activeBestHours = false;
				// Si es uContact disparamos evento
				if (this.isUcontact) {
					this.finishCallUContact(this.endOfCallValue);
				} else {
					this.resetInitialStep();
					this.cleanStorage();
				}
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				if (errorMessage[0].includes('endpoint')) {
					this.endCallException();
				} else {
					this.showToastFuntion("Fin de gestión", "warning", 'El fin de gestión seleccionado no esta configurado.', "");
				}
			});
	}

	// Metodo para obtener la información relacionada del cliente, en la pantalla 2, se muestra en acordiones
	getInfoRelatedToAccount() {
		let today = new Date();
		let twoWeeks = new Date();
		twoWeeks.setDate(today.getDate() + 14);
		this.isLoadingSpinner = true;
		this.hasOpenCasesCurrently = false;
		customerRelatedInfo({
				accountId: this.callInfo.customer.Id
			})
			.then((result) => {
				this.isLoadingSpinner = false;
				this.relatedInfo = result;
				this.dataCredit = result.relatedProducts;
				this.dataTask = this.setDataTableTask(result.relatedTasks);
				this.lastObservation = result.relatedTasks[0];
				this.lastAgreement = result.agreement[0];
				this.stepOne = false;
				this.stepTwo = true;
				this.maxPlazoAvailable = twoWeeks.toISOString().slice(0, 10);
				this.minPlazoAvailable = new Date().toISOString().slice(0, 10);
				this.pendingValue = this.callInfo.customer.CP_TotalPassToPay__c;
				if (result.relatedCases.length > 0) {
					this.hasOpenCasesCurrently = true;
				}
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				this.showToastFuntion("Ocurrio un problema", "warning", errorMessage[0], "sticky");
			});
	}

	// Metodo para capturar las referencias de fin de llamada en pantalla 1
	onchangeEndOfCallStep1(event) {
		this.endOfCallValue = event.target.value;
		this.endOfCallLabel = event.target.options.find(opt => opt.value === event.detail.value).label;
		if (this.endOfCallValue == '9') {
			this.activeBestHours = true;
		} else {
			this.activeBestHours = false;
		}
	}

	// Metodo para capturar la razon de incumplimiento
	onchangeReasonNonComp(event) {
		this.reasonNonComplianceValue = event.target.value;
		if (this.reasonNonComplianceValue == '22') {
			this.activeInputOtros = true;
		} else {
			this.activeInputOtros = false;
			this.valueOtrosReasonNonComp = '';
		}
	}

	// Metodo que se acciona en el pantalla 2 cuando se cambiar un valor del picklist fin de llamada
	onchangeEndOfCallStep2(event) {
		this.endOfCallValue = event.target.value;
		this.endOfCallLabel = event.target.options.find(opt => opt.value === event.detail.value).label;
		if (this.endOfCallValue == '1') {
			this.existConvenioDesktop = true;
		} else {
			if (this.endOfCallValue == '9') {
				this.activeBestHours = true;
			} else {
				this.activeBestHours = false;
			}
			this.existConvenioDesktop = false;
		}
	}

	// Metedo si se presiona el boton de guarda en la segunda pantalla durante la negociación
	onclickStepTwo(event) {
		let importe = this.template.querySelector(".inputValueImporteDesktop");
		let plazo = this.template.querySelector(".inputValuePlazoDesktop");
		let specificNonComp = this.template.querySelector(".inputNameOtros");
		const isValidAgreement = [...this.template.querySelectorAll('.classWhoAnsweredStep2,.classReasonNonCumpl,.classEndOfCallStep2,.inputValueImporteDesktop,.inputValuePlazoDesktop,.inputNameOtros,.classBestHourStep2')]
			.reduce((validSoFar, inputCmp) => {
				inputCmp.reportValidity();
				return validSoFar && inputCmp.checkValidity();
			}, true);
		// si los input en la pantalla estan ok entramos
		if (isValidAgreement) {
			if (specificNonComp != null) {
				this.valueOtrosReasonNonComp = specificNonComp.value;
			}
			if (this.existConvenioDesktop) {
				this.createNewAgreement(importe.value, plazo.value);
			} else {
				this.closeCallStep2();
			}
		}
	}
    //Crear tarea en la segunda pantalla
	closeCallStep2() {
		this.isLoadingSpinner = true;
		let taskParams = {
			WhatId: this.callInfo.customer.Id,
			CP_WhoAnswered__c: this.whoAnsweredStep,
			CP_EndOfCall__c: this.endOfCallValue,
			CallDisposition: this.endOfCallLabel,
			CallObject: this.callInfo.call.CP_CTIPlatform__c,
			CP_BestHourToCall__c: this.valueBestHours,
			CP_ReasonNonCompliance__c: this.reasonNonComplianceValue,
			CP_OtherReasonNonComp__c: this.valueOtrosReasonNonComp,
			CP_CallId__c: this.callInfo.call.pkwhere__c,
			OwnerId: this.callInfo.call.CP_SalesforceEmployee__c,
			CP_Dunning__c: this.callInfo.call.CP_Dunning__c
		};
		let callLocator = {
			Id: this.callInfo.call.Id,
			CP_CTIPlatform__c: this.callInfo.call.CP_CTIPlatform__c,
			finllamada__c: this.endOfCallValue,
			pkwhere__c: this.callInfo.call.pkwhere__c,
			CP_PlatformParticipantId__c: this.callInfo.call.CP_PlatformParticipantId__c,
			CP_QueueId__c: this.callInfo.call.CP_QueueId__c,
			CP_GenesysAgentToken__c: this.callInfo.call.CP_GenesysAgentToken__c,
			CP_BestHourToCall__c: this.valueBestHours
		};
		createTaskStep2({
				newTask: taskParams,
				currentCall: callLocator
			})
			.then((result) => {
				this.isLoadingSpinner = false;
				this.taskStep2 = result;
				this.showToastFuntion("Fin de llamada", "success", "Fin de llamada registrado exitosamente", "");
				this.stepTwo = false;
				this.stepThree = true;
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				this.showToastFuntion("Ocurrio un problema", "warning", errorMessage[0], "sticky");
			});
	}
   //Metodo para crear acuerdo
	createNewAgreement(amount, term) {
		this.isLoadingSpinner = true;
		let taskParams = {
			WhatId: this.callInfo.customer.Id,
			CP_WhoAnswered__c: this.whoAnsweredStep,
			CP_EndOfCall__c: this.endOfCallValue,
			CallDisposition: this.endOfCallLabel,
			CallObject: this.callInfo.call.CP_CTIPlatform__c,
			CP_BestHourToCall__c: this.valueBestHours,
			CP_DeadlineDate__c: term,
			CP_Amount__c: amount,
			CP_ReasonNonCompliance__c: this.reasonNonComplianceValue,
			CP_OtherReasonNonComp__c: this.valueOtrosReasonNonComp,
			CP_CallId__c: this.callInfo.call.pkwhere__c,
			OwnerId: this.callInfo.call.CP_SalesforceEmployee__c,
			CP_Dunning__c: this.callInfo.call.CP_Dunning__c
		};
		let callLocator = {
			Id: this.callInfo.call.Id,
			CP_CTIPlatform__c: this.callInfo.call.CP_CTIPlatform__c,
			finllamada__c: this.endOfCallValue,
			pkwhere__c: this.callInfo.call.pkwhere__c,
			CP_PlatformParticipantId__c: this.callInfo.call.CP_PlatformParticipantId__c,
			CP_QueueId__c: this.callInfo.call.CP_QueueId__c,
			CP_GenesysAgentToken__c: this.callInfo.call.CP_GenesysAgentToken__c,
			CP_BestHourToCall__c: this.valueBestHours,
			cliente__c: this.callInfo.call.cliente__c,
			numempleado__c: this.callInfo.call.numempleado__c,
			CP_SalesforceEmployee__c: this.callInfo.call.CP_SalesforceEmployee__c
		};
		newAgreement({
				newTask: taskParams,
				currentCall: callLocator
			})
			.then((result) => {
				this.isLoadingSpinner = false;
				this.taskStep2 = result;
				this.showToastFuntion("Convenio", "success", "El convenio fue grabado exitosamente", "");
				this.stepTwo = false;
				this.stepThree = true;
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				this.showToastFuntion("Ocurrio un problema", "warning", errorMessage[0], "sticky");
			});
	}

	// Configuramos la tabla de historial de llamadas con este metodo
	setDataTableTask(lstTasks) {
		let currentData = [];
		lstTasks.forEach((row) => {
			let rowData = {};
			rowData.Description = row.Description;
			rowData.ActivityDate = row.ActivityDate;
			rowData.CP_WhoAnswered__c = row.CP_WhoAnswered__c;
			rowData.CP_ReasonNonCompliance__c = row.CP_ReasonNonCompliance__c;
			rowData.CP_EndOfCall__c = row.CP_EndOfCall__c;
			rowData.CP_HasOpenCase__c = row.CP_HasOpenCase__c;
			rowData.OwnerName = row.Owner.Name;
			rowData.CP_EmployeeNumber__c = row.CP_EmployeeNumber__c;
			currentData.push(rowData);
		});
		return currentData;
	}
	// Metodo para ir calculando el saldo pendiente cuando se introduce valores en importe durante la negociación
	setPendiente(event) {
		let importe = event.detail.value;
		let pasePagar = this.callInfo.customer.CP_TotalPassToPay__c;
		this.pendingValue = pasePagar - importe;
	}
  //Metodo para el input de tiene queja
	handleCheckBoxHasCase(event) {
		this.hasCase = event.target.checked;
	}

	// Metodo que se usa en la ultima pantalla, durante la captura de datos (Posiblemente cambie en sprint 3)
	onclickStepThree() {
		const isValidDataToUpdate = [...this.template.querySelectorAll('.classPhone1,.classPhone2,.classEmail,.typePhone1,.typePhone2,.classNewObs')]
			.reduce((validSoFar, inputCmp) => {
				inputCmp.reportValidity();
				return validSoFar && inputCmp.checkValidity();
			}, true);
		// Si los valores de captura tienen datos y estan ok entramos
		if (isValidDataToUpdate) {
			let phone1 = this.template.querySelector(".classPhone1");
			let typePhone1 = this.template.querySelector(".typePhone1");
			let phone2 = this.template.querySelector(".classPhone2");
			let typePhone2 = this.template.querySelector(".typePhone2");
			let email = this.template.querySelector(".classEmail");
			let comments = this.template.querySelector(".classNewObs");
			let parametersToUpdate = {
				Id: this.callInfo.call.Id,
				tipotelefono__c: typePhone1.value,
				tipotelefono2__c: typePhone2.value,
				Telefono1__c: phone1.value,
				Telefono2__c: phone2.value,
				Email__c: email.value,
				observaciones__c: comments.value,
				finllamada__c: this.endOfCallValue,
				CP_HasOpenCase__c: this.hasCase,
				fechahorallamada__c: this.callInfo.call.fechahorallamada__c,
				pkwhere__c: this.callInfo.call.pkwhere__c,
				CP_GenesysAgentToken__c: this.callInfo.call.CP_GenesysAgentToken__c,
				CP_CTIPlatform__c: this.callInfo.call.CP_CTIPlatform__c,
				CP_PlatformParticipantId__c: this.callInfo.call.CP_PlatformParticipantId__c,
				CP_QueueId__c: this.callInfo.call.CP_QueueId__c,
			};
			// Comprobamos los datos y pasamos los parametros a esta funcion
			this.updateDataCustomer(parametersToUpdate);
		}
	}
	// Metodo que procesa la información capturada
	updateDataCustomer(parametersToUpdate) {
		this.isLoadingSpinner = true;
		updateContactInfo({
				data: parametersToUpdate,
				taskId: this.taskStep2
			})
			.then((result) => {
				this.resetInitialStep();
				this.showToastFuntion("Datos actualizado", "success", "datos actualizados exitosamente", "");
				if (this.isUcontact) {
					this.finishCallUContact(this.endOfCallValue);
				} else {
					this.cleanStorage();
				}
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				if (errorMessage[0].includes('endpoint')) {
					this.endCallException();
				} else {
					this.showToastFuntion("Fin de gestión", "warning", 'El fin de gestión seleccionado no esta configurado.', "");
				}
			});
	}
   //Metodo default para cerrar llamada si fallan los servicios
    endCallException(event) {
		this.isLoadingSpinner = true;
		let taskParams = {
			WhatId: this.callInfo.customer.Id,
			CP_WhoAnswered__c: 'NLI',
			CP_EndOfCall__c: '0',
			CallDisposition: 'Finalizada por sistema',
			CallObject: this.callInfo.call.CP_CTIPlatform__c
		};
		let callLocator = {
			Id: this.callInfo.call.Id,
			CP_CTIPlatform__c: this.callInfo.call.CP_CTIPlatform__c,
			finllamada__c: '0'
		};
		endCallWithException({
				newTask: taskParams,
				currentCall: callLocator
			})
			.then(() => {
				this.resetInitialStep();
				this.cleanStorage();
				this.showToastFuntion("Llamada", "warning", "Llamada cerrada por sistema", "");
			})
			.catch((error) => {
				this.isLoadingSpinner = false;
				let errorMessage = reduceErrors(error);
				this.showToastFuntion("Ocurrio un problema", "warning", errorMessage[0], "sticky");
			});
	}

	// Metodo que dispara un evento para enviar el fin de llamada a uContact
	finishCallUContact(valueEndCall) {
		const value = valueEndCall;
		const valueChangeEvent = new CustomEvent("valuechange", {
			detail: {
				value
			}
		});
		this.dispatchEvent(valueChangeEvent);
	}

	// Toast generico para genesys y uContact
	showToastFuntion(title, variant, message, mode = 'default') {
		if (!this.isUcontact) {
			const fireToast = new ShowToastEvent({
				title: title,
				variant: variant,
				mode: mode,
				message: message
			});
			this.dispatchEvent(fireToast);
		}
		if (this.isUcontact) {
			this.showMessageUcontact(message, variant);
		}
	}
	//Toast para uContact
	showMessageUcontact(message, type) {
		if (this.isUcontact) {
			const messageUcontact = {
				message: message,
				type: type
			}
			const notificationMessage = new CustomEvent("notification", {
				detail: {
					messageUcontact
				}
			});
			this.dispatchEvent(notificationMessage);
		}
	}

	cleanStorage() {
		clearInterval(this.cacheTimerCallInactive);
		clearInterval(this.cacheTimerCallActive);
		window.localStorage.removeItem('startTimerCall');
		window.localStorage.removeItem("totalTimeCC");
		window.localStorage.removeItem('remainingTimeEndCall');
		this.dispatchEvent(new CustomEvent('resetcounter'));
		//window.location.reload();
		this.checkCache();
	}

	resetInitialStep(){
		this.isCurrentCall = false;
		this.isEndingCall = false;
		this.isLoadingSpinner = false;
		this.activeBestHours = false;
		this.stepOne = false;
		this.stepTwo = false;
		this.stepThree = false;
		this.existConvenioDesktop = false;
		this.hasCase = false;
		this.activeInputOtros = false;
		this.isEventEndOfCallFired = false;
		this.whoAnsweredStep = '0';
	}

	//Metodo para eliminar la cache
	removeCurrentCache() {
	removeCache()
		.then(() => {
			console.log('removida');
		})
		.catch((error) => {
			console.log('error');
		});
	}

}
