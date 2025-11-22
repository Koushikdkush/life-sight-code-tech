import './App.css';
import {useEffect, useState} from "react";
import VirtualizedGroupedTableWithRegionPaging from "./custom-components/custom-table";

function App() {
    const [data, setData] = useState([]);

    useEffect(() => {
        fetch("/data/marketing_dashboard_data.json")
            .then((res) => res.json())
            .then((json) => setData(json));
    }, []);
  return (
    <div className="App">

      <VirtualizedGroupedTableWithRegionPaging data={data}/>
    </div>
  );
}

export default App;
