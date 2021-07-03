const RPECalc = {

	CashFlow: (state) => {
		return state.calculated.TotalMonthlyIncome - state.calculated.TotalMonthlyExpenses;
	},
	
	CashFlowYearly: (state) => {
		return state.calculated.CashFlow * 12;
	},

	TotalMonthlyIncome: (state) => {
		return state.changeable.MonthlyRent;
	},

	TotalYearlyIncome: (state) => {
		return state.changeable.MonthlyRent * 12;
	},

	TotalPercentageExpensesEstimate: (state) => {
		return ( state.changeable.CapEx + state.changeable.MaintRepExpense + state.changeable.MiscExpense + state.changeable.PropMngtExpense + state.changeable.VacancyExpense );
	},

	TotalMonthlyExpenses: (state) => {
		// TODO: add HOA and taxes here
		return state.calculated.TotalMonthlyIncome * ( state.calculated.TotalPercentageExpensesEstimate * 0.01 ); // whole number int generated by percentage of income;
	},

	MonthlyIncome: (state) => {
		return state.calculated.TotalMonthlyIncome; // TODO: add var for other sources of income (parking, etc)
	},

	MonthlyMortgagePayment: (state) => {
		const loanAmount = state.calculated.TotalCashInvested;
		const interest = ( state.changeable.InterestRate * 0.01 ) / 12;
		const term = state.changeable.LoanTerm * 12;
		return ( loanAmount * interest * Math.pow( ( 1 + interest ), term ) ) / ( Math.pow( ( 1 + interest), term) - 1 );
	},

	YearlyMortgagePayment: (state) => {
		return state.calculated.MonthlyMortgagePayment * 12;
	},

	DebtServiceCoverageRatio: (state) => { // debt to income ratio - cash flow available for debt service / total debt service
		return state.calculated.CashFlowYearly / state.calculated.YearlyMortgagePayment;
	},

	Cap: (state) => { // capitalization rate
		return ( state.calculated.NetOperatingIncome / state.calculated.TotalCashInvested ) * 1000;
	},

	CoCROI: (state) => { // cash on cash return on investment
		return ( state.calculated.TotalYearlyIncome / state.calculated.TotalCashInvested ) * 100; // TODO: ( ( ( Gross Rent ) + ( Other Income) ) - ( Vacancy + Operating Expenses + Annual Mortgage Payments ) ) / Total Cash Invested
	},

	NetOperatingIncome: (state) => { // net operating income
		return state.calculated.TotalMonthlyIncome - state.calculated.TotalMonthlyExpenses;
	},

	TotalCashInvested: (state) => {
		return state.changeable.PurchasePrice + state.changeable.ClosingCosts;
	}
};
export default RPECalc;