import _ from 'lodash';
import rison from 'rison'
import packageJson from '../package.json';

const kibanaVersion = packageJson.kibana.version;

export class KibanaApiService {

    /**
     * Create visualization by minimal parameters, this function if for developer that do not know very well visualization structure
     * @param iVisArr
     * @param iVisStructure
     * @returns {*}
     */
    static createVisByPartialParameters(iVisArr, iVisStructure) {
        try {
            let that = this;
            let visStateArr = [];
            let wellFormState = {};
            _.forEach(iVisArr, function (vis) {
                let wellFormVis = {};
                KibanaApiService.validateVisInput(vis);

                wellFormState = that.getWellFormVisState(vis, iVisStructure);
                let title = vis.title;
                if (title == undefined)
                    title = vis.id;

                wellFormState.title = title;

                wellFormVis.visState = _.cloneDeep(wellFormState);
                wellFormVis.id = vis.id;
                wellFormVis.visIndex = vis.visIndex;

                console.log(vis);
                visStateArr.push(wellFormVis);

            })
            return that.createVisByVisState(visStateArr);
        } catch (e) {
            return {error: e}
        }


    }


    /**
     * Create visualization by well formed visualization json structure
     * @param iVisArr
     * @returns {*}
     */
    static createVisByVisState(iVisArr) {

        try {
            let visStateArr = [];
            let that = this;
            _.forEach(iVisArr, function (vis) {
                if (vis) {
                    visStateArr.push({
                        id: vis.id,
                        state: that.getKibanaDocumentStructure(vis.visState['title'], vis.visState, vis.visIndex)
                    });
                }

            })
            if (visStateArr.length > 0) {
                return KibanaApiService.beforeCallElastic(visStateArr);
            }
            else {
                return [];
            }

        } catch (e) {
            return {error: e}
        }


    }

    /**
     * Return well formed visualization json
     * @param iVis
     * @param iVisStructure
     * @returns {*}
     */
    static getWellFormVisState(iVis, iVisStructure) {
        let visState;
        var config = iVisStructure.visStats;

        //default vis state from the config
        if (iVis.visState && iVis.visState.visType)
            visState = config[iVis.visState.visType];
        else
            visState = config["pie"];

        _.forEach(iVis.visState, function (value, inputState) {
            switch (inputState) {
                case "title":
                    visState.title = inputState
                    break;
                case 'shareYAxis':
                case 'addTooltip':
                case 'addLegend':
                case 'legendPosition':
                case 'isDonut':
                    visState.params[inputState] = value;
                    break;
                case 'field':
                case 'size':
                case 'interval':
                    visState.aggs[1].params[inputState] = value;
                    break;

                case 'aggMetricType':
                    visState.aggs[0]['type'] = value;
                    break;
                case 'aggBucketType':
                    visState.aggs[1]['type'] = value;
                    break;

            }
        })
        return visState;
    }


    /**
     *Return kibana document structure
     * @param iTitle
     * @param iVisState
     * @param iIndex
     * @returns {{title: *, visState, uiStateJSON: string, description: string, kibanaSavedObjectMeta: {searchSourceJSON}}}
     */
    static getKibanaDocumentStructure(iTitle, iVisState, iIndex) {
        let kibanaSavedObjectMeta = {
            searchSourceJSON: {
                index: iIndex,
                query: {query_string: {query: "*", analyze_wildcard: true}},
                filter: []
            }
        };
        return {
            title: iTitle,
            visState: JSON.stringify(iVisState),
            uiStateJSON: "{}",
            description: "",
            kibanaSavedObjectMeta: {"searchSourceJSON": JSON.stringify(kibanaSavedObjectMeta.searchSourceJSON)}
        };
    }


    /**
     * The final step before call elastic, return array of vis object
     * @param iVisStateArr
     * @returns {Array}
     */
    static beforeCallElastic(iVisStateArr) {
        let visArr = [];

        _.forEach(iVisStateArr, function (visState) {

            visArr.push({id: visState.id, body: visState.state});
        })
        return visArr;


    }


    /**
     * Check if the user input is valid
     * @param iVis
     */
    static validateVisInput(iVis) {
        if (iVis.id == undefined)
            console.log('%cyou send visualization without id', "color:red");
        if (iVis.field == undefined)
            console.log('you send visualization without field');


    }


    /**
     * Generate new dashboard URL
     * @param iUrl
     * @param iNewVisArr
     * @returns {string}
     */
    static generateUrl(iUrl, iNewVisArr) {
        let kibanaAppObject = rison.decode(this.getQueryVariable("_a", iUrl));
        let kibanaGlobalObject = rison.decode(this.getQueryVariable("_g", iUrl));
        let header = "";
        _.forEach(iNewVisArr, function (newVis) {
            if (newVis.prevoiusVisId) {
                KibanaApiService.handleIfHasPreviousId(newVis, kibanaAppObject.panels,);
            }
            else {
                kibanaAppObject.panels.push(KibanaApiService.getVisDashboardObject(newVis, kibanaAppObject.panels.length + 1));
            }
        })
        if (kibanaVersion.split('-')[0] === "5.3.0") {
            header = "/create";
        }

        return "/dashboard" + header + "?embed=true" + "&_g=" + rison.encode((kibanaGlobalObject)) + "&_a=" + rison.encode((kibanaAppObject));

    }

    /**
     * Handle case that has PreviousId attr
     * @param iNewVis
     * @param iPanelIndex
     */
    static handleIfHasPreviousId(iNewVis, iPanels) {
        let preVisIndex = _.findIndex(iPanels, function (o) {
            return o.id == iNewVis.prevoiusVisId;
        });
        //need to delete vis
        if (iNewVis.visState == null)
            iPanels.splice(preVisIndex, 1);
        else {
            //need to switch vis
            iPanels[preVisIndex].id = iNewVis.id;
        }
    }

    /**
     * Return  object with visualization position,size etc..
     * @param iNewVis
     * @param iPanelIndex
     * @returns {object}
     */
    static getVisDashboardObject(iNewVis, iPanelIndex) {
        if (iNewVis && iNewVis.visDashboardDefenetion)
            return iNewVis.visDashboardDefenetion
        return {col: 1, id: iNewVis.id, panelIndex: iPanelIndex, row: 1, size_x: 3, size_y: 2, type: "visualization"}
    }

    /**
     * Extractor part of URL from all URL by iVariable
     * @param iVariable
     * @param iUrl
     * @returns {string}
     */
    static getQueryVariable(iVariable, iUrl) {
        let separators = ['\\\?', '&'];
        let tokens = iUrl.split(new RegExp(separators.join('|'), 'g'));
        for (let i = 0; i < tokens.length; i++) {
            let pair = tokens[i].split('=');
            if (decodeURIComponent(pair[0]) == iVariable) {
                return decodeURIComponent(pair[1]);
            }
        }
        ;
        return null;
    }

    /**
     * Handle text filter
     * @param iText
     * @param iIndex
     * @returns {any}
     */
    static handleTextFilter(iText, iIndex) {
        return this.getKibanaFilterStructure(iText, iIndex);
    }

    /**
     * Get filter chips structure
     * @param iText
     * @param iIndex
     * @returns {any}
     */
    static getKibanaFilterStructure(iText, iIndex) {
        return {
            $state: {
                store: "appState"
            },
            meta: {
                alias: null,
                disabled: false,
                index: iIndex,
                key: 'query',
                negate: false,
                value: iText
            },
            query: {
                query_string: {
                    analyze_wildcard: true,
                    query: iText
                }
            }
        }
    }


}