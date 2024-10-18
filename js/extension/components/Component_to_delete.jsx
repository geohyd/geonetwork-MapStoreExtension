/* REQUIREMENTS */
import React, {createRef} from "react";
import Message from "@mapstore/components/I18N/Message";
import PropTypes from 'prop-types';
import Dialog from '@mapstore/components/misc/Dialog';
const {Glyphicon: GlyphiconRB, Button: ButtonRB, ButtonGroup, Row, Grid} = require('react-bootstrap');
import tooltip from '@mapstore/components/misc/enhancers/tooltip';
const Button = tooltip(ButtonRB);
import Dropzone from 'react-dropzone';
import Spinner from 'react-spinkit';
import HTML from '@mapstore/components/I18N/HTML';
const { Multiselect } = require('react-widgets');
import ConfigUtils from '@mapstore/utils/ConfigUtils';
import {Promise} from 'es6-promise';
import {
    recognizeExt,
    MIME_LOOKUPS,
    readJson,
    readZip,
    checkShapePrj,
    shpToGeoJSON
} from '@mapstore/utils/FileUtils';
import * as turf from '@turf/turf';
import { geoJSONToLayer } from '@mapstore/utils/LayersUtils';
import { checkIfLayerFitsExtentForProjection } from '@mapstore/utils/CoordinatesUtils';
import { isString, get, some, every } from 'lodash';
import JSZip from 'jszip';
import { DropdownList } from 'react-widgets';

class KnowledgeReportComponent extends React.Component {
    static propTypes = {
        initKR: PropTypes.bool,
        modalOpened: PropTypes.bool,
        closeGlyph: PropTypes.string,
        onClickClosemodal: PropTypes.func,
        onChangeLayers: PropTypes.func,
        executeIntersection: PropTypes.func,
        executeReport: PropTypes.func,
        addGeoJSONSource: PropTypes.func,
        WPSIdentifier: PropTypes.string,
        serviceURL: PropTypes.string,
        layerList: PropTypes.array,
        loadingExecution: PropTypes.bool,
        loadingReportExecution: PropTypes.bool,
        layers2Intersect: PropTypes.array,
        setReportDisableState: PropTypes.func,
        reportDisableState: PropTypes.bool,
        wps: PropTypes.object,
        geojson: PropTypes.object,
        setGeometryMethod: PropTypes.func,
        geometryMethod: PropTypes.string,
        setPrintMethod: PropTypes.func,
        printMethod: PropTypes.string,
        error: PropTypes.string,
        featuresDraw: PropTypes.array,
        drawActive: PropTypes.bool,
        drawFeatures: PropTypes.array
    };

    static defaultProps = {
        closeGlyph: "1-close",
        error: undefined,
        geojson: undefined,
        geometryMethod: 'INTERSECTS',
        printMethod: 'MAP_BY_CATEGORY',
        modalOpened: false,
        loadingExecution: false,
        loadingReportExecution: false,
        WPSIdentifier: "gs:AddamnWPS",
        serviceURL: '',
        layerList: [],
        layers2Intersect: [],
        reportDisableState: true,
        featuresDraw: [],
        currentFeature: 0,
        drawActive: false,
        drawFeatures: []
    };

    state = {
        dropZoneDisplay: false,
        dropSuccess: false,
        loading: false,
        error: false,
        success: false,
        errorMessage: '',
        geoJSON: null,
        drawActive: false,
        drawFeatures: [],
        geomtryOperations: [
            {id: 0, name: 'INTERSECTS', label: 'Intersection'},
            {id: 1, name: 'WITHIN', label: 'Contient'},
        ],
        printOperations: [
            {id: 0, name: 'ONE_MAP', label: 'Une seule carte'},
            {id: 1, name: 'MAP_BY_CATEGORY', label: 'Une carte par catégorie'},
            {id: 2, name: 'MAP_BY_LAYER', label: 'Une carte par couche'},
        ],
        successEnabled: true
    };

    onGeomError = (message) => {
        this.setState({error: true, errorMessage: message, success: false});
    };

    /**
     * Make an union on all polygon/Multipolygon for a geojson
     * The response time of geotools intersect is very better with a one multipolygon feature instead au multiple features.
     * @param {GeoJSON} geojson The uploaded geojson source
     * @returns An optimize GeoJson for the intersect geoTools
     */
    optimizeGeoJson = (geojson) => {
        try {
            const geojsonReslut = JSON.parse(JSON.stringify(geojson));
            geojsonReslut.features = [];
            const poylUnion = geojson.features.filter(feature => {
                return feature.geometry.type == 'Polygon' || feature.geometry.type == 'MultiPolygon';
            }).reduce((a, b) => turf.union(a, b), geojson.features[0]);
            poylUnion.properties = {};
            geojsonReslut.features.push(poylUnion);
            geojsonReslut.features.push(... geojson.features.filter(feature => {
                return feature.geometry.type != 'Polygon' && feature.geometry.type != 'MultiPolygon';
            }));
            return geojsonReslut;
        } catch (error) {
            console.error(error);
            return geojson;
        }
    }

    onGeomChoosen = (files) => {
        // Set state
        let that = this;
        this.setState({dropSuccess: true, error: false});
        this.props.setReportDisableState(true);
        this.geomLoading(true);
        let queue = this.readFiles(files, this.onGeomError);
        // geoJsons is array of array
        Promise.all(queue).then((responses) => {
            let geoJsons = responses.filter((file) => that.isGeoJSON(file[0]));
            let layers = geoJsons.map(json => geoJSONToLayer(json[0]));
            // Only one file allowed
            if (layers.length === 1) {
                // Check geometry
                let valid = layers[0].type === "vector" ? checkIfLayerFitsExtentForProjection(layers[0]) : true;
                if (valid) {
                    let geoJsonOpti = this.optimizeGeoJson(geoJsons[0][0]);
                    this.setState({
                        error: false,
                        success: true,
                        geoJSON: geoJsonOpti
                    });
                } else {
                    this.onGeomError('knowledgeReport.errors.fileBeyondBoundaries');
                }
            } else {
                this.onGeomError('shapefile.error.genericLoadError');
            }
            this.geomLoading(false);
        }).catch(e => {
            console.error(e);
            this.geomLoading(false);
            const errorName = e && e.name || e || '';
            if (isString(errorName) && errorName === 'SyntaxError') {
                this.onGeomError('shapefile.error.shapeFileParsingError');
            } else {
                this.onGeomError('shapefile.error.genericLoadError');
            }
        });
    };

    renderError = () => {
        return (<Row>
            <div style={{textAlign: "center"}} className="alert alert-danger"><Message msgId={this.state.errorMessage}/></div>
        </Row>);
    };

    renderSuccess = () => {
        return (
            <Grid role="body" fluid style={{marginLeft: "15px", marginRight: "15px", textAlign: "left"}}>
                <Row>
                    <div><b>Sources de données :</b> {this.state.geoJSON.fileName}</div>
                </Row>
                <Row>
                    <div><Message msgId={'knowledgeReport.success.clickToTerminate'}/></div>
                </Row>
            </Grid>
        );
    };

    renderSuccessIntersection = () => {
        if( this.props.wps && this.props.wps['result'] ){
            const totalLayers = this.props.wps['result'].length;
            const addedLayers = this.props.wps['result'].filter(x => x['ids'].length > 0).length;
            const noAddedLayers = this.props.wps['result'].filter(x => x['ids'].length <= 0).length;
            return (<div><b><Message msgId={'knowledgeReport.success.intersectResultLabel'}/> :</b> {addedLayers}/{totalLayers}</div>);
        }else {
            return (null);
        }
    };

    render() {
        return (
            <Dialog id="mapstore-knowledge-report" style={{display: this.props.modalOpened ? "block" : "none", margin:"0px"}} start={{x: 300, y: 80}} draggable={"true"} modal={false}>
                <span role="header">
                    <span className="about-panel-title"><Message msgId="knowledgeReport.modal.title" /></span>
                    <button onClick={ () => { this.props.onClickClosemodal(); this.props.onChangeLayers([]); } } className="settings-panel-close close">{this.props.closeGlyph ? <GlyphiconRB glyph={this.props.closeGlyph}/> : <span>×</span>}</button>
                </span>
                {/* Body */}
                <div role="body">
                    {( (this.props.error === undefined || ['describeProcess', 'getLayerlist'].indexOf(this.props.error) === -1) && this.props.hasOwnProperty('wps') ) ?
                        <div>
                            <div style={{fontWeight: "bold"}}><Message msgId="knowledgeReport.modal.datasetsList" /></div>
                            <Multiselect
                                // placeholder={<Message msgId="knowledgeReport.modal.listSelection" />}
                                className={'select-layer-list'}
                                data={this.props.layerList}
                                value={this.props.layers2Intersect}
                                onChange={this.props.onChangeLayers}
                                textField="layerTitle"
                                valueField="layerName"
                            />
                            <Button className={this.props.geojson !== undefined ? `btn btn-success loadGeoJSON kr-dropdown` : `btn btn-primary loadGeoJSON kr-dropdown`}
                                tooltipId={<Message msgId="knowledgeReport.modal.loadGeoJSON" />}
                                disabled={ this.props.layers2Intersect.length > 0 ? false : true }
                                onClick={() => this.setState({dropZoneDisplay: !this.state.dropZoneDisplay, dropSuccess: false})}
                                tooltipPosition="bottom">
                                <GlyphiconRB glyph="upload" /> { this.props.geojson !== undefined ?
                                    <Message msgId="knowledgeReport.modal.loadNewGeoJSON" /> :
                                    <Message msgId="knowledgeReport.modal.loadGeoJSON" />}
                            </Button>
                            <Button className={this.props.geojson !== undefined ? `btn btn-success loadGeoJSON action-button` : `btn btn-primary loadGeoJSON action-button`}
                                tooltipId={<Message msgId="knowledgeReport.modal.startDrawing" />}
                                disabled={ this.props.layers2Intersect.length > 0 ? false : true }
                                onClick={() => {this.props.drawLayer(); this.setState({drawActive: true});}}
                                tooltipPosition="bottom">
                                <GlyphiconRB glyph="pencil" /> { this.props.geojson !== undefined ?
                                    <Message msgId="knowledgeReport.modal.newDrawing" /> :
                                    <Message msgId="knowledgeReport.modal.startDrawing" />}
                            </Button>
                            <div className="validateIntersection">
                                {['intersection', 'createRecordsIntersected'].indexOf(this.props.error) > -1 && <div style={{color: "red"}}><Message msgId={`knowledgeReport.WPS.${this.props.error}`} /></div>}
                                <div className="row-action">
                                    <DropdownList
                                        className={`geometry-selection  kr-dropdown`}
                                        data={this.state.geomtryOperations}
                                        disabled={ (this.props.layers2Intersect.length > 0 && this.props.geojson !== undefined ) ? false : true }
                                        dataKey='id'
                                        textField='label'
                                        defaultValue={this.state.geomtryOperations[0].label} // Need to match with geometryMethod
                                        onChange={value => {this.props.setGeometryMethod(value.name)}}
                                    />
                                    <Button className={`btn btn-primary action-button`}
                                        tooltipId={<Message msgId="knowledgeReport.modal.intersectionExecution" />}
                                        disabled={ (this.props.layers2Intersect.length > 0 && this.props.geojson !== undefined && !this.props.loadingExecution) ? false : true }
                                        onClick={this.props.executeIntersection}
                                        tooltipPosition="bottom">
                                        {this.props.loadingExecution && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> }
                                        <Message msgId="knowledgeReport.modal.intersectionExecution" />
                                    </Button>
                                </div>
                                {
                                    !this.props.loadingExecution  && this.props.geojson && this.renderSuccessIntersection()
                                }
                                <div className="row-action">
                                    {// Disable it because we don't yet know how to manage different formats
                                    /*
                                    <DropdownList
                                        className={`print-selection kr-dropdown`}
                                        disabled={this.props.reportDisableState}
                                        data={this.state.printOperations}
                                        dataKey='id'
                                        textField='label'
                                        defaultValue={this.state.printOperations[0].label} // Need to match with printMethod
                                        onChange={value => {this.props.setPrintMethod(value.name)}}
                                    />
                                    */}
                                    <Button className={`btn btn-primary report-button`}
                                        tooltipId={<Message msgId="knowledgeReport.modal.reportExecution" />}
                                        disabled={ (this.props.reportDisableState && !this.props.loadingReportExecution)}
                                        onClick={this.props.executeReport}
                                        tooltipPosition="bottom">
                                        {this.props.loadingReportExecution && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> }
                                        <Message msgId="knowledgeReport.modal.reportExecution" />
                                    </Button>
                                </div>
                            </div>
                        </div> : <div>
                            <Message msgId={`knowledgeReport.WPS.${this.props.error}`} />
                        </div>
                    }
                    {this.state.drawActive &&
                    <Dropzone
                    disableClick
                    ref={this.drawZoneRef}
                    id="DRAW_IMPORT_GEOJSON"
                    multiple={false}
                    style={{ position: "relative", height: '100%' }}
                    onDrop={this.checkfile}>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            zIndex: 2000,
                            display: 'flex',
                            textAlign: 'center'
                        }}>
                        <Button style={{ border: "none", background: "transparent", color: "white", fontSize: 35, top: 0, right: 0, position: 'absolute' }}
                            onClick={this.cancelDrawing}>
                            <GlyphiconRB glyph="1-close" />
                        </Button>
                        <div style={{ margin: 'auto', maxWidth: 550 }}>
                            <div>
                                <div>
                                    <GlyphiconRB
                                        glyph="pencil"
                                        style={{
                                            fontSize: 80
                                        }} />
                                    <HTML msgId="knowledgeReport.drawZone.heading" />
                                    <br />
                                    <Button bsStyle="primary btn-lg" onClick={this.stopDrawing}
                                    disabled={ !(this.props.drawFeatures && this.props.drawFeatures.length)}>
                                        <Message msgId="knowledgeReport.drawZone.stopDrawing" />
                                    </Button>
                                    <br />
                                    <br />
                                    <br />
                                    <div>
                                    <HTML msgId="knowledgeReport.drawZone.featureLength" />{this.props.drawFeatures && this.props.drawFeatures.length ? this.props.drawFeatures.length : 0}
                                    </div>
                                    <br />
                                    <hr />
                                    <Button bsStyle="warning" onClick={this.cancelDrawing}><Message msgId="knowledgeReport.drawZone.cancelDrawing" /></Button>
                                </div>
                            </div>
                        </div>
                    </div>
                    </Dropzone>
                    }
                    {this.state.dropZoneDisplay &&
                    <Dropzone
                        disableClick
                        ref={this.dropzoneRef}
                        id="DRAGDROP_IMPORT_GEOJSON"
                        multiple={false}
                        style={{ position: "relative", height: '100%' }}
                        onDrop={this.checkfile}>
                        <div
                            style={{
                                position: 'fixed',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                left: 0,
                                background: 'rgba(0,0,0,0.75)',
                                color: '#fff',
                                zIndex: 2000,
                                display: 'flex',
                                textAlign: 'center'
                            }}>
                            <Button style={{ border: "none", background: "transparent", color: "white", fontSize: 35, top: 0, right: 0, position: 'absolute' }}
                                onClick={this.reset}>
                                <GlyphiconRB glyph="1-close" />
                            </Button>
                            <div style={{ margin: 'auto', maxWidth: 550 }}>
                                <div>
                                    {!this.state.dropSuccess ?
                                        <div>
                                            <GlyphiconRB
                                                glyph="upload"
                                                style={{
                                                    fontSize: 80
                                                }} />
                                            <HTML msgId="knowledgeReport.dropZone.heading" />
                                            <Button bsStyle="primary" onClick={this.openFileDialog}><Message msgId="knowledgeReport.dropZone.selectFiles" /></Button>
                                            <br />
                                            <br />
                                            <HTML msgId="knowledgeReport.dropZone.infoSupported" />
                                            <hr />
                                            <HTML msgId="knowledgeReport.dropZone.note" />
                                            <div>
                                                {this.state.error ? this.renderError() : null}
                                            </div>
                                        </div> :
                                        <Dialog id="knowledgeReport-getgeojson" draggable={false} modal={false}>
                                            <span role="header">
                                                <span className="about-panel-title"><Message msgId="knowledgeReport.dialog.title" /></span>
                                            </span>
                                            <div role="body" style={{color: "black"}}>
                                                {this.state.loading ?
                                                    <div className="btn" style={{"float": "center"}}> <Spinner spinnerName="circle" noFadeIn overrideSpinnerClassName="spinner"/></div> :
                                                    <div>
                                                        {this.state.error ? this.renderError() : null}
                                                        {this.state.success ? this.renderSuccess() : null}
                                                    </div>
                                                }
                                            </div>
                                            <div role="footer">
                                                <ButtonGroup id="knowledgeReport-validation">
                                                    <Button bsStyle="default" onClick={this.reset}><Message msgId="knowledgeReport.footer.cancel" /></Button>
                                                    {this.state.error ? null : <Button bsStyle="primary" onClick={this.triggerUploadGeoJSON} disabled={!this.state.successEnabled}><Message msgId="knowledgeReport.footer.validate" /></Button>}
                                                </ButtonGroup>
                                            </div>
                                        </Dialog> }
                                </div>
                            </div>
                        </div>
                    </Dropzone>}
                </div>
                <div role="footer">
                    <p style={{fontStyle: "italic"}}><Message msgId="knowledgeReport.title" /></p>
                </div>
            </Dialog>
            );
    }

    openFileDialog = () => {
        // Note that the ref is set async,
        // so it might be null at some point
        if (this.dropzoneRef.current) {
            this.dropzoneRef.current.open();
        }
    };

    stopDrawing = () => {
        this.setState({drawActive: false});
        this.props.stopDrawing();
    }

    cancelDrawing = () => {
        this.setState({drawActive: false});
        this.props.cancelDrawing();
    }

    tryUnzip = (file) => {
        return readZip(file).then((buffer) => {
            let zip = new JSZip();
            return zip.loadAsync(buffer);
        });
    };

    readFiles = (files, onWarnings) => files.map((file) => {
        const ext = recognizeExt(file.name);
        const type = file.type || MIME_LOOKUPS[ext];
        const projectionDefs = ConfigUtils.getConfigProp('projectionDefs') || [];
        const supportedProjections = (projectionDefs.length && projectionDefs.map(({code})  => code) || []).concat(["EPSG:4326", "EPSG:3857", "EPSG:900913"]);
        if (type === 'application/json') {
            return readJson(file).then(f => {
                const projection = get(f, 'map.projection');
                'crs' in f  && delete f['crs']; // The lib in WPS cannot read the CRS writing from QGIS (urn:ogc:def:crs:OGC:1.3:CRS84); All GeoJson need to be in 4326, so delete it ...
                if (projection) {
                    if (supportedProjections.includes(projection)) {
                        return [{...f, "fileName": file.name}];
                    }
                    throw new Error("PROJECTION_NOT_SUPPORTED");
                }
                return [{...f, "fileName": file.name}];
            });
        }
        if (type === 'application/x-zip-compressed' ||
            type === 'application/zip' ) {
            return readZip(file).then((buffer) => {
                return checkShapePrj(buffer).then((warnings) => {
                    if (warnings.length > 0) {
                        onWarnings('shapefile.error.missingPrj');
                    }
                    const geoJsonArr = shpToGeoJSON(buffer).map(json => ({ ...json, filename: file.name }));
                    const areProjectionsPresent = some(geoJsonArr, geoJson => !!get(geoJson, 'map.projection'));
                    if (areProjectionsPresent) {
                        const filteredGeoJsonArr = geoJsonArr.filter(item => !!get(item, 'map.projection'));
                        const areProjectionsValid = every(filteredGeoJsonArr, geoJson => supportedProjections.includes(geoJson.map.projection));
                        if (areProjectionsValid) {
                            return geoJsonArr;
                        }
                        throw new Error("PROJECTION_NOT_SUPPORTED");
                    }
                    return geoJsonArr;
                });
            });
        }
        onWarnings('knowledgeReport.errors.fileNotSupported');
        return null;
    })

    checkFileType = (file) => {
        return new Promise((resolve, reject) => {
            const ext = recognizeExt(file.name);
            const type = file.type || MIME_LOOKUPS[ext];
            if (type === 'application/json' ||
                type === 'application/x-zip-compressed' ||
                type === 'application/zip') {
                resolve();
            }  else {
                this.tryUnzip(file).then(resolve).catch(reject);
            }
        });
    };

    checkfile = (files) => {
        Promise.all(files.map(file => this.checkFileType(file))).then(() => {
            this.onGeomChoosen(files);
        }).catch(() => {
            this.onGeomError('knowledgeReport.errors.fileNotSupported');
        });
    };

    isGeoJSON = json => json && json.features && json.features.length !== 0;

    triggerUploadGeoJSON = () => {
        this.reset();
        this.props.addGeoJSONSource(this.state.geoJSON);
    }

    dropzoneRef = createRef();
    drawZoneRef = createRef();

    geomLoading = (boolValue) => this.setState({loading: boolValue});

    reset = () => {
        this.setState({
            dropZoneDisplay: !this.state.dropZoneDisplay,
            dropSuccess: false,
            error: false,
            success: false,
            successEnabled: true
        });
    };
}

export default KnowledgeReportComponent;
