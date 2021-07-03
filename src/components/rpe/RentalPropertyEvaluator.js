import React 			from 'react';
import FieldDataObject  from './fieldDataObject'
import FieldsSection	from './components/FieldsSection';
import ResultsField		from './components/ResultsField';
import RPECalc			from './RPECalc';

class RentalPropertyEvaluator extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			changeable: {
				PurchasePrice: 99000,
				ClosingCosts: 1000,
				MonthlyRent: 1000,
				InterestRate: 5,
				LoanTerm: 30,
				CapEx:5,
				MaintRepExpense:2.5,
				MiscExpense:2.5,
				PropMngtExpense:5,
				VacancyExpense:5,
				HOA: 1200,
				Taxes: 1000,
				PercentDown:0,
			},
			calculated: {
				TotalCashInvested: 0,
				TotalMonthlyIncome: 0,
				TotalYearlyIncome: 0,
				CashFlow: 0,
				CashFlowYearly: 0,
				TotalMonthlyExpenses: 0,
				MonthlyMortgagePayment: 0,
				TotalPercentageExpensesEstimate: 0,
				NetOperatingIncome: 0,
				CoCROI: 0,
				Cap: 0,
				DebtServiceCoverageRatio: 0,
			}
		}
		this.handleFieldChange = this.handleFieldChange.bind(this);
	}

	async handleFieldChange(inputChanged, newValue) {
		await this.setState( ( prevState ) => {
			const newState = { ...prevState };
			newState.changeable[inputChanged] = parseInt( newValue );
			return newState;
		})
		await this.calcAllDynamically();
	}

	async calcAllDynamically(count = 1) {
		while ( count ) {
			await this.setState( ( prevState ) => {
				const newState = { ...prevState };
				for (var key of Object.keys(newState.calculated)) {
					newState.calculated[ key ] = RPECalc.[key](this.state);
				}
				return newState;
			})
			count--;
		}
	}

	componentDidMount() {
		this.calcAllDynamically(2);
	}

	render() {
		return(
			<section className="flex space-between width-three-quarters flex-wrap">
				<FieldsSection sectionTitle={"Variable Expenses"} handleFieldChange={this.handleFieldChange} curState={this.state} sectionId="ExpenseSection" fieldsArray={FieldDataObject.ExpenseFormFieldsArray} />
				<FieldsSection sectionTitle={"Inputs"} handleFieldChange={this.handleFieldChange} curState={this.state} sectionId="RentalPropertyEvaluatorForm" fieldsArray={FieldDataObject.EvalFormFieldsArray} />
				<section className="FieldsSection side-padded width-one-fifth">
					<h5 className='left'>Results</h5>
					{ FieldDataObject.ResultsBoxFields.map( (field,key) => <ResultsField key={key} result={(this.state.calculated[field.id]) ? this.state.calculated[field.id] : this.state[field.id]} fieldTitle={field.id} isPercentage={field.isPercentage} />) }
				</section>
			</section>
		);
	}
}

export default RentalPropertyEvaluator;