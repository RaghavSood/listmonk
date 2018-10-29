import React from "react"
import { Row, Col, Form, Select, Input, Checkbox, Upload, Button, Icon, Spin, Progress, Popconfirm, Tag, notification } from "antd"
import * as cs from "./constants"

const StatusNone      = "none"
const StatusImporting = "importing"
const StatusStopping  = "stopping"
const StatusFinished  = "finished"
const StatusFailed  = "failed"

class TheFormDef extends React.PureComponent {
    state = {
        confirmDirty: false,
        fileList: []
    }

    componentDidMount() {
        // Fetch lists.
        this.props.modelRequest(cs.ModelLists, cs.Routes.GetLists, cs.MethodGet)
    }

    // Handle create / edit form submission.
    handleSubmit = (e) => {
        e.preventDefault()
        var err = null, values = {}
        this.props.form.validateFields((e, v) => {
            err = e
            values = v
        })
        if (err) {
            return
        }

        if(this.state.fileList.length < 1) {
            notification["error"]({ message: "Error", description: "Select a valid file to upload" })
            return
        }

        let params = new FormData()
        params.set("params", JSON.stringify(values))
        params.append("file", this.state.fileList[0])

        this.props.request(cs.Routes.UploadRouteImport, cs.MethodPost, params).then(() => {
            notification["info"]({ message: "File uploaded",
                description: "Please wait while the import is running" })
            this.props.fetchimportState()
        }).catch(e => {
            notification["error"]({ message: "Error", description: e.message })
        })
    }

    handleConfirmBlur = (e) => {
        const value = e.target.value
        this.setState({ confirmDirty: this.state.confirmDirty || !!value })
    }

    onFileChange = (f) => {
        let fileList = [f]
        this.setState({ fileList })
        return false
    }

    render() {
        const { getFieldDecorator } = this.props.form

        const formItemLayout = {
            labelCol: { xs: { span: 16 }, sm: { span: 4 } },
            wrapperCol: { xs: { span: 16 }, sm: { span: 10 } }
        }

        const formItemTailLayout = {
            wrapperCol: { xs: { span: 24, offset: 0 }, sm: { span: 10, offset: 4 } }
        }

        return (
            <Spin spinning={false}>
                <Form onSubmit={this.handleSubmit}>
                    <Form.Item {...formItemLayout} label="Lists" extra="Lists to subscribe to">
                        {getFieldDecorator("lists", { rules: [{ required: true }] })(
                            <Select mode="multiple">
                                {[...this.props.lists].map((v, i) =>
                                    <Select.Option value={v["id"]} key={v["id"]}>{v["name"]}</Select.Option>
                                )}
                            </Select>
                        )}
                    </Form.Item>
                    <Form.Item {...formItemLayout}
                        label="Override status?"
                        extra="For existing subscribers in the system found again in the import, override their status, for example 'blacklisted' to 'active'. This is not always desirable.">
                        {getFieldDecorator("override_status", )(
                            <Checkbox initialValue="1" />
                        )}
                    </Form.Item>
                    <Form.Item {...formItemLayout} label="CSV column delimiter" extra="Default delimiter is comma">
                        {getFieldDecorator("delim", {
                            initialValue: ","
                        })(<Input maxLength="1" style={{ maxWidth: 40 }} />)}
                    </Form.Item>
                    <Form.Item
                        {...formItemLayout}
                        label="ZIP file">
                        <div className="dropbox">
                            {getFieldDecorator("file", {
                                valuePropName: "file",
                                getValueFromEvent: this.normFile,
                                rules: [{ required: true }]
                            })(
                                <Upload.Dragger name="files"
                                    multiple={ false }
                                    fileList={ this.state.fileList }
                                    beforeUpload={ this.onFileChange }
                                    accept=".zip">
                                    <p className="ant-upload-drag-icon">
                                        <Icon type="inbox" />
                                    </p>
                                    <p className="ant-upload-text">Click or drag file here</p>
                                </Upload.Dragger>
                            )}
                        </div>
                    </Form.Item>
                    <Form.Item {...formItemTailLayout}>
                        <Button type="primary" htmlType="submit"><Icon type="upload" /> Upload &amp; import</Button>
                    </Form.Item>
                </Form>
            </Spin>
        )
    }
}
const TheForm = Form.create()(TheFormDef)

class Importing extends React.PureComponent {
    state = {
        pollID: -1,
        logs: ""
    }

    stopImport = () => {
        // Get the import status.
        this.props.request(cs.Routes.UploadRouteImport, cs.MethodDelete).then((r) => {
            this.props.fetchimportState()
        }).catch(e => {
            notification["error"]({ message: "Error", description: e.message })
        })
    }

    componentDidMount() {
        // Poll for stats until it's finished or failed.
        let pollID = window.setInterval(() => {
            this.props.fetchimportState()
            this.fetchLogs()
            if( this.props.importState.status === StatusFinished ||
                this.props.importState.status === StatusFailed ) {
                window.clearInterval(this.state.pollID)
            }    
        }, 1000)

        this.setState({ pollID: pollID })
    }
    componentWillUnmount() {
        window.clearInterval(this.state.pollID)
    }

    fetchLogs() {
        this.props.request(cs.Routes.GetRouteImportLogs, cs.MethodGet).then((r) => {
            this.setState({ logs: r.data.data })
            let t = document.querySelector("#log-textarea")
            t.scrollTop = t.scrollHeight;
        }).catch(e => {
            notification["error"]({ message: "Error", description: e.message })
        })
    }

    render() {
        let progressPercent = 0
        if( this.props.importState.status === StatusFinished ) {
            progressPercent = 100
        } else {
            progressPercent = Math.floor(this.props.importState.imported / this.props.importState.total * 100)
        }

        return(
            <section className="content import">
                <h1>Importing &mdash; { this.props.importState.name }</h1>
                { this.props.importState.status === StatusImporting &&
                    <p>Import is in progress. It is safe to navigate away from this page.</p>
                }

                { this.props.importState.status !== StatusImporting &&
                    <p>Import has finished.</p>
                }

                <Row className="import-container">
                    <Col span="10" offset="3">
                        <div className="stats center">
                            <div>
                                <Progress type="line" percent={ progressPercent } />
                            </div>

                            <div>
                                <h3>{ this.props.importState.imported } records</h3>
                                <br />

                                { this.props.importState.status === StatusImporting &&
                                    <Popconfirm title="Are you sure?" onConfirm={() => this.stopImport()}>
                                        <p><Icon type="loading" /></p>
                                        <Button type="primary">Stop import</Button>
                                    </Popconfirm>
                                }
                                { this.props.importState.status === StatusStopping &&
                                    <div>
                                        <p><Icon type="loading" /></p>
                                        <h4>Stopping</h4>
                                    </div>
                                }
                                { this.props.importState.status !== StatusImporting &&
                                  this.props.importState.status !== StatusStopping &&
                                    <div>
                                        { this.props.importState.status !== StatusFinished &&
                                            <div>
                                                <Tag color="red">{ this.props.importState.status }</Tag>
                                                <br />
                                            </div>
                                        }
                                        
                                        <br />
                                        <Button type="primary" onClick={() => this.stopImport()}>Done</Button>
                                    </div>
                                }
                            </div>
                        </div>

                        <div className="logs">
                            <h3>Import log</h3>
                            <Spin spinning={ this.state.logs === "" }>
                                <Input.TextArea placeholder="Import logs"
                                    id="log-textarea"
                                    rows={10}
                                    value={ this.state.logs }
                                    autosize={{ minRows: 2, maxRows: 10 }} />
                            </Spin>
                        </div>
                    </Col>
                </Row>
            </section>
        )
    }
}

class Import extends React.PureComponent {
    state = {
        importState: { "status": "" }
    }

    fetchimportState = () => {
        // Get the import status.
        this.props.request(cs.Routes.GetRouteImportStats, cs.MethodGet).then((r) => {
            this.setState({ importState: r.data.data })
        }).catch(e => {
            notification["error"]({ message: "Error", description: e.message })
        })
    }

    componentDidMount() {
        this.fetchimportState()
    }
    render() {
        if( this.state.importState.status === "" ) {
            // Fetching the status.
            return (
                <section className="content center">
                    <Spin />
                </section>
            )
        } else if ( this.state.importState.status !== StatusNone ) {
            // There's an import state
            return <Importing { ...this.props }
                            importState={ this.state.importState }
                            fetchimportState={ this.fetchimportState } />
        }

        return (
            <section className="content import">
                <Row>
                    <Col span={22}><h1>Import subscribers</h1></Col>
                    <Col span={2}>
                    </Col>
                </Row>

                <TheForm { ...this.props }
                    fetchimportState={ this.fetchimportState }
                    lists={ this.props.data[cs.ModelLists] }>
                </TheForm>

                <hr />
                <div className="help">
                    <h2>Instructions</h2>
                    <p>Upload a ZIP file with a single CSV file in it
                        to bulk import a large number of subscribers in a single shot.
                    </p>
                    <p>
                        The CSV file should have the following headers with the exact column names
                        (<code>status</code> and <code>attributes</code> are optional).
                        {" "}
                        <code>attributes</code> should be a valid JSON string with double escaped quotes.
                        Spreadsheet programs should automatically take care of this without having to manually
                        escape quotes.
                    </p>

                    <blockquote className="csv-example">
                        <code className="csv-headers">
                            <span>email,</span>
                            <span>name,</span>
                            <span>status,</span>
                            <span>attributes</span>
                        </code>
                    </blockquote>

                    <h3>Example raw CSV</h3>
                    <blockquote className="csv-example">
                        <code className="csv-headers">
                            <span>email,</span>
                            <span>name,</span>
                            <span>status,</span>
                            <span>attributes</span>
                        </code>
                        <code className="csv-row">
                            <span>user1@mail.com,</span>
                            <span>"User One",</span>
                            <span>enabled,</span>
                            <span>{ '"{""age"": 32, ""city"": ""Bangalore""}"' }</span>
                        </code>
                        <code className="csv-row">
                            <span>user2@mail.com,</span>
                            <span>"User Two",</span>
                            <span>blacklisted,</span>
                            <span>{ '"{""age"": 25, ""occupation"": ""Time Traveller""}"' }</span>
                        </code>
                    </blockquote>
                </div>
            </section>
        )
    }
}

export default Import