import React 			from 'react';
import FieldDataObject  from './fieldDataObject'
import FieldsSection	from './components/FieldsSection';
import ResultsField		from './components/ResultsField';
import LocalStorage		from './components/LocalStorage';
import RPECalc			from './RPECalc';

export default class RentalPropertyEvaluator extends React.Component {
	constructor(props) {
		super(props);
		this.state = localStorage.getItem('rpeCalculationsSet')
				? { // if local storage is set
						changeable: JSON.parse( this.urlPayloadExists() ? this.getUrlParamsAsObject() : localStorage.getItem('changeableRPE') ),
						calculated: JSON.parse( localStorage.getItem('calculatedRPE') )
				} : {
						changeable: this.urlPayloadExists() ? JSON.parse( this.getUrlParamsAsObject() ) : FieldDataObject.changeable,
						calculated: FieldDataObject.calculated
				}

		this.handleFieldChange = this.handleFieldChange.bind(this);
	}

	getUrlParamsAsObject() {
		return JSON.stringify( Object.fromEntries( new URLSearchParams(window.location.search).entries() ) );
	}

	async handleFieldChange(inputChanged, newValue) {
		console.log('field has changed ', inputChanged, newValue)
		await this.setState( ( prevState ) => {
			const newState = { ...prevState };
			newState.changeable[inputChanged] = parseFloat( newValue );
			return newState;
		})
		await this.calcAllDynamically();
	}

	async calcAllDynamically(count = 2) {
		while ( count ) {
			await this.setState( ( prevState ) => {
				const newState = { ...prevState };
				for (var key of Object.keys(newState.calculated)) {
					try {
						newState.calculated[ key ] = RPECalc.[key](this.state);
					} catch(err) {
						console.error(key, err);
					}
				}
				return newState;
			})
			count--;
		}

		if ( ! localStorage.getItem('rpeCalculationsSet') ) {
			this.saveStateToLocal();
		} else {
			this.saveStateToLocal( this.state.changeable, this.state.calculated );
		}

		try {
			document.getElementById('TotalExpensesMonthly').value = this.state.calculated.TotalExpensesMonthly.toFixed(2); // TODO: fix via passing updated state to input field
			document.getElementById('TotalExpensesYearly').value = this.state.calculated.TotalExpensesYearly.toFixed(2); // TODO: fix via passing updated state to input field
			document.getElementById('TotalPercentageExpensesEstimate').value = this.state.calculated.TotalPercentageExpensesEstimate.toFixed(2); // TODO: fix via passing updated state to input field
		} catch(err) {
			console.error(err);
		}
	}

	componentDidMount() {
		if ( this.urlPayloadExists() ) {
			this.setStateViaUrlPayload();
		}
		this.calcAllDynamically();
		document.querySelectorAll('.rpe-reset-link').forEach( el => {
			el.addEventListener('click', (e) => {
				e.preventDefault();
				this.resetLocalStorage()
			});
		});
	}

	saveStateToLocal( changeable = { ...FieldDataObject.changeable }, calculated = { ...FieldDataObject.calculated } ) { // saves default values if no args present
		localStorage.setItem('rpeCalculationsSet', true);
		localStorage.setItem('changeableRPE', JSON.stringify( changeable ));
		localStorage.setItem('calculatedRPE', JSON.stringify( calculated ));
	}

	async resetStateToDefaults() {
		this.saveStateToLocal();
		await this.setState({changeable: JSON.parse( localStorage.getItem('changeableRPE') ), calculated: JSON.parse( localStorage.getItem('calculatedRPE') ) });
		await this.calcAllDynamically();
		for (var key of Object.keys(this.state.changeable)) {
			try {
				document.getElementById(key).value = this.state.changeable[key]; // TODO: fix via passing updated state to input field
			} catch(err) { // TODO: fix error when checkbox is clicked to properly set value
				console.error(err);
			}
		}
		document.getElementById('IncludeClosingCostsInMortgage').checked = false; // reset the checkbox manually
	}

	resetLocalStorage() {
		this.resetStateToDefaults();
		if ( window.history.pushState["arguments"] ) { // if has URL params
			window.history.pushState({}, document.title, "/" ); // clear any URL params
		}
	}

	async setStateViaUrlPayload() {
		const urlParams = new URLSearchParams(window.location.search);
		const entries = urlParams.entries();
		for(const entry of entries) {
			await this.handleFieldChange(entry[0], entry[1]);
		}
	}

	urlPayloadExists() {
		return ! new URLSearchParams( window.location.search ).values().next()['done'];
	}

	render() {
		return(
		 	<div id="rpe-container" className="App hide-branding mx-3 columns">
				<section id="rental-property-evaluator" className="columns is-multiline container column width-full">
					<section className="grid space-between flex-wrap columns container mr-0 is-marginless">
						<FieldsSection 
							curState={this.state} 
							sectionTitle={"Income & Mortgage"} 
							sectionId="RentalPropertyEvaluatorForm" 
							onCheckboxToggle={this.onCheckboxToggle}
							handleFieldChange={this.handleFieldChange} 
							fieldsArray={FieldDataObject.EvalFormFieldsArray} />
						<FieldsSection 
							curState={this.state} 
							sectionTitle={"Expenses"}  
							sectionId="ExpenseSection" 
							onCheckboxToggle={this.onCheckboxToggle}
							handleFieldChange={this.handleFieldChange}
							fieldsArray={FieldDataObject.ExpenseFormFieldsArray} />
						<section className="FieldsSection side-padded width-one-fifth column py-0 is-5 resultsBox has-background-white is-fit-content">
							<h3 className='left is-size-4 is-italic has-font-weight-bold title-border'>Results</h3>
							{ FieldDataObject.ResultsBoxFields.map( (field,key) => <ResultsField key={key} isPassing={(field.threshold)?(this.state.calculated[field.id] > field.threshold)?"true":"false":null} result={(this.state.calculated[field.id]) ? this.state.calculated[field.id] : this.state[field.id]} toolTip={field.toolTip} fieldTitle={field.id} labelText={field.labelText} monthYear={field.monthYear} isPercentage={field.isPercentage} />) }
							<h5 className='right is-size-4 is-italic has-font-weight-bold title-border is-size-6'>Monthly &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Yearly</h5>
							{ FieldDataObject.ResultsBoxFieldsMonthlyYearly.map( (field,key) => <ResultsField key={key} isPassing={(field.threshold)?(this.state.calculated[field.id] > field.threshold)?"true":"false":null} result={(this.state.calculated[field.id]) ? this.state.calculated[field.id] : this.state[field.id]} toolTip={field.toolTip} fieldTitle={field.id} labelText={field.labelText} monthYear={field.monthYear} isPercentage={field.isPercentage} />) }
						</section>
					</section>
					<section className="grid space-between flex-wrap column is-full">
						<LocalStorage resetLocalStorage={() => this.resetLocalStorage()} />
					</section>
				</section>
			</div>
		);
	}
}
