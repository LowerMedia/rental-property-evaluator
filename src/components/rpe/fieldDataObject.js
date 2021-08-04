const FieldDataObject = {
	
	changeable: {
		CapEx:0,
		ClosingCosts: 3000,
		HOA: 0,
		IncludeClosingCostsInMortgage: false,
		Insurance:800,
		InterestRate: 4.5,
		LoanTerm: 30,
		MaintRepExpense:0,
		MiscExpense:0,
		MonthlyRent: 1000,
		PercentDown:20,
		PropMngtExpense:0,
		PurchasePrice: 100000,
		Taxes: 1500,
		VacancyExpense:5,
		OtherExpense:1200,
	},

	calculated: {
		CapEx:0,
		MaintRepExpense:0,
		PropMngtExpense:0,
		MiscExpense:0,
		VacancyExpense:0,
		Cap: 0,
		CashFlow: 0,
		CashFlowYearly: 0,
		CoCROI: 0,
		DebtServiceCoverageRatio: 0,
		MortgagePayment: 0,
		NetOperatingIncome: 0,
		TotalCashInvested: 0,
		TotalLoanAmount: 0,
		TotalMonthlyExpenses: 0,
		TotalMonthlyIncome: 0,
		TotalExpensesMonthly:0,
		TotalExpensesYearly:0,
		TotalPercentageExpensesEstimate: 0,
		TotalDollarExpensesEstimate: 0,
		TotalYearlyIncome: 0,
		YearlyMortgagePayment: 0,
		EBDITA: 0,
		GrossRentMultiplier: 0,
		OnePercentRule: 0,
		TotalInterestPaidMonthly: 0,
		TotalInterestPaidYearly: 0,
		TotalInterestPaid: 0,
		LoanTermMonths: 0,
	},

	ResultsBoxFields: [
		{id:"CoCROI",labelText:"CoCROI (Year 1)",isPercentage:"true",threshold:10,toolTip:"( ( ( Gross Rent ) + ( Other Income) ) - ( Vacancy + Operating Expenses + Annual Mortgage Payments ) )"},
		{id:"Cap",labelText:"Cap",isPercentage:"true",threshold:7.5,toolTip:"E = mc^2"},
		{id:"DebtServiceCoverageRatio",labelText:"DSCR",threshold:1.25,toolTip:"debt to income ratio - cash flow available for debt service / total debt service"},
		{id:"GrossRentMultiplier",labelText:"GRM",threshold: 1,toolTip:"Purchase Price / Monthly Rent "},
		{id:"OnePercentRule",labelText:"1% Rule", isPercentage:"true",threshold: .99,toolTip:"Monthly Income / Purchase Price"},
		{id:"EBDITA",labelText:"EBDITA",toolTip:"E = mc^2"},
		{id:"TotalCashInvested",labelText:"Cash Inv.",toolTip:"E = mc^2"},
		{id:"TotalLoanAmount",labelText:"Loan Amt",toolTip:"E = mc^2"},
	],

	ResultsBoxFieldsMonthlyYearly: [
		{id:"NetOperatingIncome",labelText:"NOI", monthYear:true,toolTip:"E = mc^2"},
		{id:"CashFlow",labelText:"CashFlow", monthYear:true,toolTip:"E = mc^2"},
		{id:"TotalMonthlyIncome",labelText:"Income", monthYear:true,toolTip:"E = mc^2"},
		{id:"MortgagePayment",labelText:"Mortgage", monthYear:true,toolTip:"E = mc^2"},
		{id:"TotalInterestPaid",labelText:"Ttl Intrst Paid", monthYear:true,toolTip:"Principal * Rate * Time"},
	],

	EvalFormFieldsArray: [
		{id:"MonthlyRent",labelText:"Estimated Rent: ",numType:"currency"},
		{id:"PurchasePrice",labelText:"Purchase Price: ",numType:"currency"},
		{id:"PercentDown",labelText:"Percent Down: ",numType:"percentage"},
		{id:"InterestRate",labelText:"Interest Rate: ",numType:"percentage"},
		{id:"LoanTerm",labelText:"Loan Term: ",numType:"years"},
		{id:"ClosingCosts",labelText:"Closing Costs: ",numType:"currency"},
		{id:"IncludeClosingCostsInMortgage",labelText:"Include Closing Costs In Mortgage? ",inputType:"checkbox"}
	],

	ExpenseFormFieldsArray: [
		{id:"CapEx",labelText:"Cap Ex",defaultValue:5,numType:"percentage",fieldType:"variableExpense"},
		{id:"MaintRepExpense",labelText:"Maint/Rep",defaultValue:2.5,numType:"percentage",fieldType:"variableExpense"},
		{id:"MiscExpense",labelText:"Misc",defaultValue:2.5,numType:"percentage",fieldType:"variableExpense"},
		{id:"PropMngtExpense",labelText:"PropMngt",defaultValue:5,numType:"percentage",fieldType:"variableExpense"},
		{id:"VacancyExpense",labelText:"Vacancy",defaultValue:5,numType:"percentage",fieldType:"variableExpense"},
		{id:"TotalPercentageExpensesEstimate",labelText:"Percentage Total",numType:"percentage",fieldType:"variableExpenseTotal"},
		{id:"HOA",labelText:"HOA: ",numType:"currency"},
		{id:"Taxes",labelText:"Tax Estimate: ",numType:"currency"},
		{id:"Insurance",labelText:"Insurance Estimate: ",numType:"currency"},
		{id:"OtherExpense",labelText:"Other: ",numType:"currency"},
		{id:"TotalExpensesMonthly",labelText:"Total Monthly",numType:"currency",fieldType:"variableExpenseTotal"},
		{id:"TotalExpensesYearly",labelText:"Total Yearly",numType:"currency",fieldType:"variableExpenseTotal"},
	],
};

export default FieldDataObject;